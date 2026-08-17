import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';
import type { ConversationExecutionMode } from '../../shared/actions/ExecutionModeTypes';

function createSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return {
    name: 'test-stt',
    isSupported: () => true,
    start: async (callbacks) => ({ stop: () => callbacks.onEnd?.(), cancel: () => {} }),
  };
}

function createSpeechSynthesisProvider(): TextToSpeechProvider {
  return {
    name: 'test-tts',
    supportsVisemes: false,
    isSupported: () => true,
    speak: async () => {},
    stop: () => {},
  };
}

/**
 * Emits exactly one tool call (write_file or run_command) on its FIRST invocation, then behaves
 * like a real model reacting to a tool result on every later invocation (plain text, never
 * re-invoking the same tool) — a naive provider that blindly re-emits the tool call on every
 * `streamResponse` call would make ConversationRuntime's own continue-the-turn behavior look like
 * a second, real execution attempt, which isn't what any of these tests are checking.
 */
function createToolCallReasoningProvider(toolName: 'write_file' | 'run_command'): ReasoningProvider {
  const args =
    toolName === 'write_file'
      ? { path: 'C:\\scratch\\notes.txt', content: 'hello' }
      : { command: 'npm run build', cwd: 'C:\\scratch' };
  let calls = 0;
  return {
    id: 'test-reasoning',
    label: 'Test Reasoning',
    isSupported: () => true,
    streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      calls += 1;
      if (calls === 1) {
        callbacks.onToolCall?.({ id: 'tool-1', name: toolName, arguments: args });
      } else {
        callbacks.onDelta('Okay.');
        callbacks.onComplete('Okay.');
      }
      if (calls === 1) callbacks.onComplete('');
      return { cancel: () => {} };
    },
  };
}

async function waitForIdle(runtime: { getSnapshot: () => { state: string } }): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (runtime.getSnapshot().state === 'idle') return;
    await Promise.resolve();
  }
}

/**
 * Wraps a confirmation-gated mock so it only applies to the action type under test — a finalized
 * task also fires an unrelated, fire-and-forget `recordTaskProvenance` call (Memory Graph
 * bookkeeping, ConversationRuntime.ts's own `recordTaskProvenance()`) that isn't part of what
 * these tests are checking and must not be counted as a second execution attempt.
 */
function calledForType(spy: ReturnType<typeof vi.fn>, type: string): unknown[][] {
  return spy.mock.calls.filter(([request]) => (request as { type?: string })?.type === type);
}

async function createRuntime(opts: {
  toolName: 'write_file' | 'run_command';
  executionMode: ConversationExecutionMode;
  bypassPermissionsEnabled: boolean;
  executeAction: (request: ActionRequest) => Promise<ActionResult>;
}) {
  const { ConversationRuntime } = await import('./ConversationRuntime');
  return new ConversationRuntime({
    speechRecognition: createSpeechRecognitionProvider(),
    speechSynthesis: createSpeechSynthesisProvider(),
    reasoningRuntime: new ReasoningRuntime(createToolCallReasoningProvider(opts.toolName)),
    executeAction: opts.executeAction,
    describeAction: async () => 'Working on that…',
    reportActionResult: async (_request, result) => (result.ok ? 'Done.' : result.message ?? 'Stopped.'),
    getExecutionMode: () => opts.executionMode,
    isBypassPermissionsEnabled: () => opts.bypassPermissionsEnabled,
  });
}

describe('ConversationRuntime execution modes — confirmation wiring', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }, 10000);

  it('Manual mode: a write_file requiring confirmation waits for a real human "yes", never auto-confirms', async () => {
    const calls: ActionRequest[] = [];
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      calls.push(request);
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Overwrite existing file?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'write_file', executionMode: 'manual', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('write the file');
    await waitForIdle(runtime);

    expect(calledForType(executeAction, 'writeFile')).toHaveLength(1);
    expect(runtime.getSnapshot().pendingConfirmation).toBe(true);
  }, 10000);

  it('Auto mode (default): preserves today\'s behavior — still waits for a real human "yes"', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Overwrite existing file?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'write_file', executionMode: 'auto', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('write the file');
    await waitForIdle(runtime);

    expect(calledForType(executeAction, 'writeFile')).toHaveLength(1);
    expect(runtime.getSnapshot().pendingConfirmation).toBe(true);
  }, 10000);

  it('Accept edits mode: a writeFile requiring confirmation is auto-confirmed via the real executeConfirmedAction path', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Overwrite existing file?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'write_file', executionMode: 'acceptEdits', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('write the file');
    await waitForIdle(runtime);

    const writeFileCalls = calledForType(executeAction, 'writeFile');
    expect(writeFileCalls).toHaveLength(2);
    expect(writeFileCalls[1]?.[0]).toMatchObject({ confirmed: true });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
  }, 10000);

  it('Accept edits mode: a runCommand (not an edit type) still waits for a real human "yes"', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Run this command?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'acceptEdits', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    expect(calledForType(executeAction, 'runCommand')).toHaveLength(1);
    expect(runtime.getSnapshot().pendingConfirmation).toBe(true);
  }, 10000);

  it('Bypass mode with the setting OFF (default): still waits for a real human "yes" — the security-critical case', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Run this command?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'bypass', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    expect(calledForType(executeAction, 'runCommand')).toHaveLength(1);
    expect(runtime.getSnapshot().pendingConfirmation).toBe(true);
  }, 10000);

  it('Bypass mode with the setting explicitly ON: auto-confirms via the real executeConfirmedAction path', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (!('confirmed' in request) || !(request as { confirmed?: boolean }).confirmed) {
        return { ok: false, reason: 'requires-confirmation', message: 'Run this command?' };
      }
      return { ok: true };
    });
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'bypass', bypassPermissionsEnabled: true, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    const runCommandCalls = calledForType(executeAction, 'runCommand');
    expect(runCommandCalls).toHaveLength(2);
    expect(runCommandCalls[1]?.[0]).toMatchObject({ confirmed: true });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
  }, 10000);

  it('Bypass mode ON still cannot bypass a real backend entitlement/security refusal — the mode only supplies "yes", it never fabricates success', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      reason: 'entitlement-restricted',
      message: 'Your plan does not include this capability.',
    }));
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'bypass', bypassPermissionsEnabled: true, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    // The backend never returned requires-confirmation, so shouldAutoConfirmAction is never
    // consulted at all — executeAction is called exactly once for the real action, and the real
    // refusal stands (regardless of how many times the unrelated recordTaskProvenance fires).
    expect(calledForType(executeAction, 'runCommand')).toHaveLength(1);
    const task = runtime.getSnapshot().messages.find((m) => m.task)?.task;
    expect(task?.actions[0]?.result).toMatchObject({ ok: false, reason: 'entitlement-restricted' });
  }, 10000);
});
