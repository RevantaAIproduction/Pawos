import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

/**
 * Isolated tests for HeadlessTurnRunner's own settlement-detection state machine — the subtle,
 * first-party logic that turns ConversationRuntime's snapshot stream into a single
 * `{finished}`/`{waitingForPermission}` result. Everything about the REAL reasoning loop
 * (investigate/plan/edit/validate driven by a live Gemini call) is intentionally NOT exercised here
 * — that requires a live LLM/IPC/Electron and is disclosed as REQUIRES LIVE TEST in the final report.
 * This file verifies only the deterministic wiring around it: ignoring subscribe()'s synchronous
 * initial replay, settling on pendingConfirmation vs. idle, and never double-settling — plus (see the
 * second describe block below) the real, checked "autonomousPlanBypass" entitlement gate that decides
 * acceptEdits vs. manual execution mode.
 */

type Snapshot = { pendingConfirmation: boolean; state: string };
type Listener = (snapshot: Snapshot) => void;

class FakeConversationRuntime {
  private listeners: Listener[] = [];
  private snapshot: Snapshot = { pendingConfirmation: false, state: 'idle' };
  submitTranscriptCalls: string[] = [];

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener(this.snapshot);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  submitTranscript(text: string) {
    this.submitTranscriptCalls.push(text);
  }

  emit(snapshot: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...snapshot };
    for (const l of [...this.listeners]) l(this.snapshot);
  }
}

const mocks = vi.hoisted(() => ({
  lastInstance: null as FakeConversationRuntime | null,
  lastArgs: null as Record<string, unknown> | null,
  entitlementCheck: null as ((featureId: string) => Promise<boolean>) | null,
}));

vi.mock('../conversation/ConversationRuntime', () => ({
  ConversationRuntime: vi.fn().mockImplementation((args: Record<string, unknown>) => {
    mocks.lastArgs = args;
    const instance = new FakeConversationRuntime();
    mocks.lastInstance = instance;
    return instance;
  }),
}));

vi.mock('../reasoning/ReasoningRuntime', () => ({
  ReasoningRuntime: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../ai/AIRouter', () => ({
  aiRouter: { getReasoningProvider: vi.fn(() => ({})) },
}));

vi.mock('../conversation/systemPrompt', () => ({
  buildSystemPrompt: vi.fn(() => 'system prompt'),
}));

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    actionExecute: vi.fn(),
    actionCheckRequirements: vi.fn(),
    executionRecord: vi.fn(),
    // Defaults to true (acceptEdits) so this file's own settlement-detection tests are unaffected by
    // the entitlement gate; the dedicated Plan-policy describe block below overrides per test.
    entitlementIsFeatureAvailable: (featureId: string) => (mocks.entitlementCheck ?? (() => Promise.resolve(true)))(featureId),
  }),
}));

import { HeadlessTurnRunner } from './AutonomousOrchestrator';

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'exec-1', goal: 'g', status: 'completed', startedAt: Date.now(), applicationsUsed: [], aiWorkersUsed: [],
    commandsExecuted: [], filesCreated: [], filesModified: [], verificationResults: [], recoveryAttempts: 0, timeline: [], summary: '',
    ...overrides,
  };
}

/** run() now does a real `await` (the entitlement check) before constructing ConversationRuntime, so
 *  mocks.lastInstance is no longer set synchronously the moment run() is called — poll microtasks
 *  until the mocked constructor has actually run. */
async function waitForInstance(): Promise<FakeConversationRuntime> {
  for (let i = 0; i < 20 && !mocks.lastInstance; i++) await Promise.resolve();
  if (!mocks.lastInstance) throw new Error('ConversationRuntime was never constructed');
  return mocks.lastInstance;
}

describe('HeadlessTurnRunner.run() — settlement detection', () => {
  beforeEach(() => {
    mocks.lastInstance = null;
    mocks.lastArgs = null;
    mocks.entitlementCheck = null;
  });

  it('ignores subscribe()\'s synchronous initial replay — never settles before submitTranscript actually runs anything', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    // At this point subscribe() has already fired its synchronous replay (idle, no confirmation) —
    // if that were treated as a real event, the promise would already be resolved. It must not be.
    let settled = false;
    void promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    instance.emit({ state: 'idle' });
    await promise;
  });

  it('settles "finished" once state genuinely transitions to idle after real processing', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'thinking' });
    instance.emit({ state: 'idle' });

    const result = await promise;
    expect(result.kind).toBe('finished');
  });

  it('settles "waitingForPermission" the moment pendingConfirmation genuinely becomes true', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ pendingConfirmation: true });

    const result = await promise;
    expect(result.kind).toBe('waitingForPermission');
  });

  it('calls submitTranscript exactly once with the real prompt', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('investigate TICKET-1', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    await promise;

    expect(instance.submitTranscriptCalls).toEqual(['investigate TICKET-1']);
  });

  it('never double-settles even if idle fires twice in a row', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    instance.emit({ state: 'idle' });

    const result = await promise;
    expect(result.kind).toBe('finished');
  });

  it('resume() returns null when no live session exists for that run id (e.g. app restarted)', async () => {
    const runner = new HeadlessTurnRunner();
    const result = await runner.resume('never-started-run', true);
    expect(result).toBeNull();
  });

  it('resume() with granted:false discards the session without calling submitTranscript again', async () => {
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ pendingConfirmation: true });
    await promise;

    const result = await runner.resume('run-1', false);
    expect(result).toEqual({ kind: 'finished', executionRecord: null });
    expect(instance.submitTranscriptCalls).toEqual(['prompt']);

    const again = await runner.resume('run-1', true);
    expect(again).toBeNull();
  });

  it('resume() with granted:true re-submits "yes" on the same live instance and can settle a second waitingForPermission', async () => {
    const runner = new HeadlessTurnRunner();
    const runPromise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ pendingConfirmation: true });
    await runPromise;

    const resumePromise = runner.resume('run-1', true);
    // First, the confirmation clears (a real reply was processed)...
    instance.emit({ pendingConfirmation: false, state: 'thinking' });
    // ...then a second destructive action requires confirmation again.
    instance.emit({ pendingConfirmation: true });

    const result = await resumePromise;
    expect(result?.kind).toBe('waitingForPermission');
    expect(instance.submitTranscriptCalls).toEqual(['prompt', 'yes']);
  });
});

/**
 * Section 2 (Plan) fix — the audit finding that HeadlessTurnRunner unconditionally ran in
 * 'acceptEdits' with no entitlement check anywhere in the path. This is now a real, checked policy:
 * only an account holding 'autonomousPlanBypass' gets 'acceptEdits'; everything else falls back to
 * 'manual', which — per ExecutionModeTypes.shouldAutoConfirmAction() — means even writeFile/
 * applyCodeEdit pause for a real human decision instead of auto-confirming.
 */
describe('HeadlessTurnRunner.run() — Plan-policy entitlement gate', () => {
  beforeEach(() => {
    mocks.lastInstance = null;
    mocks.lastArgs = null;
    mocks.entitlementCheck = null;
  });

  it('checks the real "autonomousPlanBypass" feature id — never a different or hardcoded flag', async () => {
    const seen: string[] = [];
    mocks.entitlementCheck = async (featureId) => {
      seen.push(featureId);
      return true;
    };
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    await promise;

    expect(seen).toEqual(['autonomousPlanBypass']);
  });

  it('an entitled account (Pro Max/Team/Enterprise) runs in acceptEdits', async () => {
    mocks.entitlementCheck = async () => true;
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    await promise;

    const args = mocks.lastArgs as { getExecutionMode: () => string };
    expect(args.getExecutionMode()).toBe('acceptEdits');
  });

  it('a non-entitled account falls back to manual — applyCodeEdit/writeFile will genuinely pause for a human decision', async () => {
    mocks.entitlementCheck = async () => false;
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    await promise;

    const args = mocks.lastArgs as { getExecutionMode: () => string };
    expect(args.getExecutionMode()).toBe('manual');
  });

  it('an entitlement-check failure (e.g. IPC error) never crashes the run and defaults to the safer manual mode', async () => {
    mocks.entitlementCheck = async () => {
      throw new Error('IPC unavailable');
    };
    const runner = new HeadlessTurnRunner();
    const promise = runner.run('prompt', { autonomousRunId: 'run-1' });
    const instance = await waitForInstance();
    instance.emit({ state: 'idle' });
    const result = await promise;

    expect(result.kind).toBe('finished');
    const args = mocks.lastArgs as { getExecutionMode: () => string };
    expect(args.getExecutionMode()).toBe('manual');
  });
});

void record;
