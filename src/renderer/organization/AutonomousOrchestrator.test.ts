import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import type { AutonomousOutcome } from '../../shared/organization/AutonomousTaskBillingTypes';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    actionExecute: vi.fn(),
    actionCheckRequirements: vi.fn(),
    executionRecord: vi.fn(),
    connectivityGetStatus: vi.fn(),
    connectivityVerifyPullRequestExists: vi.fn(),
    connectivityPostAutonomousCompletionComment: vi.fn(),
  }),
}));

vi.mock('../reasoning/ReasoningRuntime', () => ({
  ReasoningRuntime: vi.fn().mockImplementation(() => ({ setTools: vi.fn(), setProvider: vi.fn(), setSystemPrompt: vi.fn() })),
}));

vi.mock('../ai/AIRouter', () => ({
  aiRouter: { getReasoningProvider: vi.fn(() => ({})) },
}));

vi.mock('../conversation/systemPrompt', () => ({
  buildSystemPrompt: vi.fn(() => 'system prompt'),
}));

// AutonomousOrchestrator.ts imports ConversationRuntime at module top level (for
// HeadlessTurnRunner's real implementation) — that module transitively pulls in IntentRegistry.ts
// -> CompanionProfileStore.ts, which touches `window` eagerly at import time. None of the tests in
// this file ever construct a real ConversationRuntime (they inject a FakeTurnRunner instead), but
// the import chain still executes just from importing AutonomousOrchestrator.ts, so it must be
// mocked here too, exactly like HeadlessTurnRunner.test.ts already does for its own direct tests.
vi.mock('../conversation/ConversationRuntime', () => ({
  ConversationRuntime: vi.fn(),
}));

import {
  buildAutonomousPrompt,
  deriveOutcomeFromExecutionRecord,
  orchestrateAutonomousRun,
  resumeAutonomousRun,
  type AutonomousOrchestrationDeps,
  type AutonomousTurnRunner,
  type HeadlessTurnResult,
} from './AutonomousOrchestrator';

function baseExecutionRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'exec-1',
    goal: 'Fix TICKET-1',
    status: 'completed',
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    applicationsUsed: [],
    aiWorkersUsed: [],
    commandsExecuted: [],
    filesCreated: [],
    filesModified: [],
    verificationResults: [],
    commandEvidence: [],
    fileEvidence: [],
    diffEvidence: [],
    verificationEvidence: [],
    recoveryAttempts: 0,
    timeline: [],
    summary: 'Applied the fix and validated it.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

describe('buildAutonomousPrompt', () => {
  it('includes ticket id, source, title, description, and cwd when all are present', () => {
    const prompt = buildAutonomousPrompt({ ticketId: 'JIRA-1', ticketSource: 'jira', ticketTitle: 'Fix login', ticketDescription: 'Login fails on Safari' }, '/repo');
    expect(prompt).toContain('Jira');
    expect(prompt).toContain('JIRA-1');
    expect(prompt).toContain('Fix login');
    expect(prompt).toContain('Login fails on Safari');
    expect(prompt).toContain('/repo');
  });

  it('never fabricates a title/description that was not supplied', () => {
    const prompt = buildAutonomousPrompt({ ticketId: 'TICKET-1', ticketSource: null }, '/repo');
    expect(prompt).not.toContain('Title:');
    expect(prompt).not.toContain('Description:');
  });

  it('handles a ticketless run honestly', () => {
    const prompt = buildAutonomousPrompt({ ticketId: null, ticketSource: null }, '/repo');
    expect(prompt).toContain('the task described below');
    expect(prompt).not.toContain('ticket null');
  });

  it('always instructs the model to stop honestly rather than force an unrelated change', () => {
    const prompt = buildAutonomousPrompt({ ticketId: 'T-1', ticketSource: null }, '/repo');
    expect(prompt.toLowerCase()).toContain('cannot');
  });
});

describe('deriveOutcomeFromExecutionRecord — evidence-based success determination', () => {
  it('NOT_EXECUTED: no ExecutionRecord at all never produces success', () => {
    const outcome = deriveOutcomeFromExecutionRecord(null);
    expect(outcome.kind).toBe('failed');
    expect(outcome.evidence.executionRecordId).toBeNull();
    expect(outcome.evidence.checks[0]!.status).toBe('NOT_EXECUTED');
  });

  it('a completed status with real file/command evidence and no failed checks is success', () => {
    const record = baseExecutionRecord({
      commandEvidence: [{ command: 'npm test', safeCommand: 'npm test', cwd: '/repo', startedAt: 1, completedAt: 2, durationMs: 1, status: 'completed' }],
      fileEvidence: [{ operation: 'MODIFY', path: 'src/x.ts', timestamp: 1, result: 'completed' }],
    });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('success');
    expect(outcome.evidence.executionRecordId).toBe('exec-1');
    expect(outcome.evidence.commandsExecuted).toBe(1);
    expect(outcome.evidence.filesChanged).toBe(1);
  });

  it('a real failed TEST verification check overrides a "completed" status — model self-report alone is never sufficient', () => {
    const record = baseExecutionRecord({
      status: 'completed',
      summary: 'I fixed it and all tests pass.',
      verificationEvidence: [{ type: 'TEST', action: 'npm test', status: 'failed', summary: 'Test failed.', failureReason: '2 tests failed', timestamp: 1 }],
    });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('failed');
    expect(outcome.reason).toContain('verification');
  });

  it('a skipped verification check (e.g. no lint config) never blocks success on its own', () => {
    const record = baseExecutionRecord({
      verificationEvidence: [{ type: 'LINT', action: 'eslint', status: 'skipped', summary: 'No lint config found.', timestamp: 1 }],
    });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('success');
  });

  it('a "failed" ExecutionRecord status is always FAILED, never success', () => {
    const record = baseExecutionRecord({ status: 'failed', summary: 'Could not apply the fix.' });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('failed');
  });

  it('an "abandoned" record with a real stoppedReason is BLOCKED, not silently failed or completed', () => {
    const record = baseExecutionRecord({ status: 'abandoned', stoppedReason: 'Entitlement restricted mid-run.' });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('blocked');
    expect(outcome.reason).toBe('Entitlement restricted mid-run.');
  });

  it('an "abandoned" record with no stoppedReason falls back to failed, never fabricates a blocked reason', () => {
    const record = baseExecutionRecord({ status: 'abandoned' });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('failed');
  });

  it('zero files changed and zero commands executed is honestly represented as NOT_CAPTURED, even on a completed status', () => {
    const record = baseExecutionRecord();
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.evidence.checks.some((c) => c.status === 'NOT_CAPTURED')).toBe(true);
  });

  it('non-required verification types (e.g. HEALTH_CHECK) never gate success', () => {
    const record = baseExecutionRecord({
      verificationEvidence: [{ type: 'HEALTH_CHECK', action: 'ping', status: 'failed', summary: 'unrelated', timestamp: 1 }],
    });
    const outcome = deriveOutcomeFromExecutionRecord(record);
    expect(outcome.kind).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// Orchestration flow — state machine, billing, duplication, connectors — all via injected fakes,
// no live LLM/IPC/Electron required.
// ---------------------------------------------------------------------------

class FakeTurnRunner implements AutonomousTurnRunner {
  runResult: HeadlessTurnResult = { kind: 'finished', executionRecord: baseExecutionRecord() };
  resumeResult: HeadlessTurnResult | null = { kind: 'finished', executionRecord: baseExecutionRecord() };
  runCalls: { prompt: string; runId: string }[] = [];
  resumeCalls: { runId: string; granted: boolean }[] = [];

  async run(prompt: string, opts: { autonomousRunId: string }): Promise<HeadlessTurnResult> {
    this.runCalls.push({ prompt, runId: opts.autonomousRunId });
    return this.runResult;
  }
  async resume(autonomousRunId: string, granted: boolean): Promise<HeadlessTurnResult | null> {
    this.resumeCalls.push({ runId: autonomousRunId, granted });
    return this.resumeResult;
  }
}

function fakeDeps(overrides: Partial<AutonomousOrchestrationDeps> = {}): { deps: AutonomousOrchestrationDeps; turnRunner: FakeTurnRunner; billing: Record<string, ReturnType<typeof vi.fn>> } {
  const turnRunner = new FakeTurnRunner();
  const billing = {
    transitionRun: vi.fn().mockResolvedValue({}),
    markTerminal: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue('billing-event-1'),
  };
  const deps: AutonomousOrchestrationDeps = {
    billingService: billing as unknown as AutonomousOrchestrationDeps['billingService'],
    turnRunner,
    getConnectorStatus: vi.fn().mockResolvedValue({ ok: true, data: { state: 'connected', capabilities: [] } }),
    verifyPullRequestExists: vi.fn().mockResolvedValue({ ok: true, data: { verified: true, reason: 'Confirmed.' } }),
    postCompletionComment: vi.fn().mockResolvedValue({ ok: true, data: { posted: true, reason: 'Posted.' } }),
    getCurrentUserId: vi.fn().mockResolvedValue('user-1'),
    checkGitState: vi.fn().mockResolvedValue({ ok: true, data: { branch: 'main', ahead: 0, behind: 0, staged: [], unstaged: [], untracked: [], clean: true } }),
    createIsolatedWorkspace: vi.fn().mockResolvedValue({ ok: true, data: { worktreePath: '/repo-pawos-autonomous-run-1', branchName: 'pawos-autonomous/run-1', baseCommit: 'abc123', sourceRepo: '/repo' } }),
    ...overrides,
  };
  return { deps, turnRunner, billing };
}

const baseInput = { runId: 'run-1', organizationId: null, ticketSource: null as null, ticketId: 'TICKET-1', cwd: '/repo' };

describe('orchestrateAutonomousRun — connector gate', () => {
  it('Jira ticket, connector disconnected: BLOCKED before any headless turn runs, no charge', async () => {
    const { deps, turnRunner, billing } = fakeDeps({ getConnectorStatus: vi.fn().mockResolvedValue({ ok: true, data: { state: 'disconnected', capabilities: [] } }) });
    const result = await orchestrateAutonomousRun({ ...baseInput, ticketSource: 'jira' }, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(turnRunner.runCalls.length).toBe(0);
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'blocked', expect.stringContaining('Jira'));
  });

  it('a ticketless run never checks any connector', async () => {
    const { deps, turnRunner } = fakeDeps();
    await orchestrateAutonomousRun({ ...baseInput, ticketId: null, ticketSource: null }, deps);
    expect(deps.getConnectorStatus).not.toHaveBeenCalled();
    expect(turnRunner.runCalls.length).toBe(1);
  });
});

describe('orchestrateAutonomousRun — workspace isolation gate (the cwd/execution-context fix)', () => {
  it('an unreadable/non-git cwd is BLOCKED before any headless turn runs — never falls back to guessing', async () => {
    const { deps, turnRunner, billing } = fakeDeps({
      checkGitState: vi.fn().mockResolvedValue({ ok: false, message: '"/repo" doesn\'t look like a git repository.' }),
    });
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(turnRunner.runCalls.length).toBe(0);
    expect(deps.createIsolatedWorkspace).not.toHaveBeenCalled();
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'blocked', expect.stringContaining('known git state'));
    expect(result.outcome.evidence.checks[0]).toMatchObject({ label: 'Git state', status: 'BLOCKED' });
  });

  it('a worktree-creation failure is BLOCKED before any headless turn runs — never operates directly on the real checkout', async () => {
    const { deps, turnRunner, billing } = fakeDeps({
      createIsolatedWorkspace: vi.fn().mockResolvedValue({ ok: false, message: 'worktree path already exists' }),
    });
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(turnRunner.runCalls.length).toBe(0);
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(result.outcome.evidence.checks.map((c) => c.label)).toEqual(['Git state', 'Workspace isolation']);
    expect(result.outcome.evidence.checks[1]).toMatchObject({ label: 'Workspace isolation', status: 'BLOCKED' });
  });

  it('a real run operates against the isolated WORKTREE path, never the raw source cwd', async () => {
    const { deps, turnRunner } = fakeDeps();
    await orchestrateAutonomousRun(baseInput, deps);

    expect(deps.createIsolatedWorkspace).toHaveBeenCalledWith('/repo', '/repo-pawos-autonomous-run-1', 'pawos-autonomous/run-1');
    expect(turnRunner.runCalls[0]!.prompt).toContain('/repo-pawos-autonomous-run-1');
    expect(turnRunner.runCalls[0]!.prompt).not.toContain('repository is checked out locally at: /repo\n');
  });

  it('a successful run carries real git-state and workspace-isolation evidence on the final result', async () => {
    const { deps, turnRunner } = fakeDeps();
    turnRunner.runResult = { kind: 'finished', executionRecord: baseExecutionRecord() };
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.evidence.checks[0]).toMatchObject({ label: 'Git state', status: 'CAPTURED' });
    expect(result.outcome.evidence.checks[1]).toMatchObject({ label: 'Workspace isolation', status: 'CAPTURED' });
    expect(result.outcome.evidence.checks[1]!.detail).toContain('/repo-pawos-autonomous-run-1');
  });

  it('git-state/isolation evidence survives a mid-run WAITING_FOR_PERMISSION pause too', async () => {
    const { deps, turnRunner } = fakeDeps();
    turnRunner.runResult = { kind: 'waitingForPermission', executionRecord: null };
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(result.outcome.evidence.checks[0]).toMatchObject({ label: 'Git state', status: 'CAPTURED' });
    expect(result.outcome.evidence.checks[1]).toMatchObject({ label: 'Workspace isolation', status: 'CAPTURED' });
  });
});

describe('orchestrateAutonomousRun — state machine', () => {
  it('queued -> running: transitionRun("running") is called before the headless turn starts', async () => {
    const { deps, billing } = fakeDeps();
    await orchestrateAutonomousRun(baseInput, deps);
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'running', expect.any(String));
  });

  it('running -> waiting_for_permission: reported honestly, never charged, never marked completed', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).runResult = { kind: 'waitingForPermission', executionRecord: baseExecutionRecord({ status: 'in_progress' as ExecutionRecord['status'] }) };

    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'waiting_for_permission', expect.any(String));
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(billing.markTerminal).not.toHaveBeenCalled();
    expect(result.outcome.kind).not.toBe('success');
  });

  it('running -> completed: a real success outcome calls completeRun exactly once', async () => {
    const { deps, billing } = fakeDeps();
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('success');
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
    expect(billing.markTerminal).not.toHaveBeenCalled();
  });

  it('running -> failed: markTerminal("failed") is called, never completeRun', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).runResult = { kind: 'finished', executionRecord: baseExecutionRecord({ status: 'failed', summary: 'broke it' }) };

    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('failed');
    expect(billing.markTerminal).toHaveBeenCalledWith('run-1', 'failed');
    expect(billing.completeRun).not.toHaveBeenCalled();
  });

  it('running -> blocked (mid-execution stoppedReason): transitionRun("blocked"), never markTerminal/completeRun', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).runResult = { kind: 'finished', executionRecord: baseExecutionRecord({ status: 'abandoned', stoppedReason: 'Coding entitlement restricted mid-run.' }) };

    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(billing.markTerminal).not.toHaveBeenCalled();
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'blocked', 'Coding entitlement restricted mid-run.');
  });
});

describe('resumeAutonomousRun', () => {
  it('permission denied -> cancelled, no charge, no live-session lookup needed', async () => {
    const { deps, billing, turnRunner } = fakeDeps();
    const result = await resumeAutonomousRun(baseInput, false, deps);

    expect(result.outcome.kind).toBe('cancelled');
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'cancelled', expect.any(String));
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(turnRunner.resumeCalls.length).toBe(0);
  });

  it('permission granted, no live session (app restarted): honestly BLOCKED, never fabricates a resumed result', async () => {
    const { deps, billing } = fakeDeps({ turnRunner: { run: vi.fn(), resume: vi.fn().mockResolvedValue(null) } as unknown as AutonomousTurnRunner });
    const result = await resumeAutonomousRun(baseInput, true, deps);

    expect(result.outcome.kind).toBe('blocked');
    expect(result.outcome.reason).toContain('restart');
    expect(billing.completeRun).not.toHaveBeenCalled();
  });

  it('permission granted, live session resumes to success: completes and charges exactly once', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).resumeResult = { kind: 'finished', executionRecord: baseExecutionRecord() };

    const result = await resumeAutonomousRun(baseInput, true, deps);

    expect(result.outcome.kind).toBe('success');
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
  });

  it('permission granted, resumes into a SECOND waiting_for_permission: honestly reported again, never silently completed', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).resumeResult = { kind: 'waitingForPermission', executionRecord: baseExecutionRecord({ status: 'in_progress' as ExecutionRecord['status'] }) };

    const result = await resumeAutonomousRun(baseInput, true, deps);

    expect(result.outcome.kind).not.toBe('success');
    expect(billing.completeRun).not.toHaveBeenCalled();
    expect(billing.transitionRun).toHaveBeenCalledWith('run-1', 'waiting_for_permission', expect.any(String));
  });
});

describe('orchestrateAutonomousRun — external update (the one genuinely real connector write capability)', () => {
  it('no prUrl supplied: NOT_EXECUTED, never attempts to post a comment, still completes and charges', async () => {
    const { deps, billing } = fakeDeps();
    const result = await orchestrateAutonomousRun(baseInput, deps);

    expect(result.externalUpdate.status).toBe('NOT_EXECUTED');
    expect(deps.postCompletionComment).not.toHaveBeenCalled();
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
  });

  it('a real prUrl with a successful comment post: CAPTURED, and completion still proceeds', async () => {
    const { deps, billing } = fakeDeps();
    const result = await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);

    expect(deps.postCompletionComment).toHaveBeenCalledWith('https://github.com/org/repo/pull/1', expect.any(String));
    expect(result.externalUpdate.status).toBe('CAPTURED');
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
  });

  it('a real prUrl but the connector is disconnected: BLOCKED for that one step — never blocks the overall successful completion', async () => {
    const { deps, billing } = fakeDeps({ postCompletionComment: vi.fn().mockResolvedValue({ ok: true, data: { posted: false, reason: 'GitHub is not connected.' } }) });
    const result = await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);

    expect(result.externalUpdate.status).toBe('BLOCKED');
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
  });

  it('a real prUrl but the comment API call itself fails: FAILED for that step, still never blocks overall completion', async () => {
    const { deps, billing } = fakeDeps({ postCompletionComment: vi.fn().mockResolvedValue({ ok: false, error: 'network error' }) });
    const result = await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);

    expect(result.externalUpdate.status).toBe('FAILED');
    expect(billing.completeRun).toHaveBeenCalledTimes(1);
  });

  it('never attempted for a run that did not succeed', async () => {
    const { deps, billing } = fakeDeps();
    (deps.turnRunner as FakeTurnRunner).runResult = { kind: 'finished', executionRecord: baseExecutionRecord({ status: 'failed' }) };

    const result = await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);

    expect(deps.postCompletionComment).not.toHaveBeenCalled();
    expect(result.externalUpdate.status).toBe('NOT_EXECUTED');
    expect(billing.completeRun).not.toHaveBeenCalled();
  });
});

describe('orchestrateAutonomousRun — evidence-based PR verification at completion', () => {
  it('a genuinely verified PR sets prVerified:true on the completion call', async () => {
    const { deps, billing } = fakeDeps();
    await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);
    expect(billing.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: true, ticketVerified: false }));
  });

  it('an unverifiable PR never fabricates prVerified:true', async () => {
    const { deps, billing } = fakeDeps({ verifyPullRequestExists: vi.fn().mockResolvedValue({ ok: true, data: { verified: false, reason: 'not found' } }) });
    await orchestrateAutonomousRun({ ...baseInput, prUrl: 'https://github.com/org/repo/pull/1' }, deps);
    expect(billing.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ prVerified: false }));
  });

  it('ticketVerified is unconditionally false — no genuine ticket write-back capability exists', async () => {
    const { deps, billing } = fakeDeps();
    await orchestrateAutonomousRun(baseInput, deps);
    expect(billing.completeRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ ticketVerified: false }));
  });
});
