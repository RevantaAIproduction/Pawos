import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationTaskRecord } from './ConversationTypes';
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

    // Asked in chat first — nothing runs before the user replies "allow".
    expect(calledForType(executeAction, 'writeFile')).toHaveLength(0);
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

    // Asked in chat first — nothing runs before the user replies "allow".
    expect(calledForType(executeAction, 'writeFile')).toHaveLength(0);
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
    expect(writeFileCalls).toHaveLength(1);
    expect(writeFileCalls[0]?.[0]).toMatchObject({ confirmed: true });
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

    expect(calledForType(executeAction, 'runCommand')).toHaveLength(0);
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

    expect(calledForType(executeAction, 'runCommand')).toHaveLength(0);
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
    expect(runCommandCalls).toHaveLength(1);
    expect(runCommandCalls[0]?.[0]).toMatchObject({ confirmed: true });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
  }, 10000);

  it('asks in chat only ("I need permission to run …"), then "allow" runs it confirmed', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'manual', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    const chat = runtime.getSnapshot().messages.filter((m) => m.role === 'assistant').map((m) => m.content);
    expect(chat).toContain('I need permission to run `npm run build` in C:\\scratch.\nReply "allow" and I\'ll proceed, or "deny" to skip.');
    expect(chat.some((c) => c.startsWith('I heard'))).toBe(false);
    expect(runtime.getSnapshot().messages.some((m) => m.extensions?.some((e) => e.type === 'permission'))).toBe(false);

    runtime.submitTranscript('allow');
    for (let i = 0; i < 50 && calledForType(executeAction, 'runCommand').length === 0; i += 1) await Promise.resolve();
    expect(calledForType(executeAction, 'runCommand')[0]?.[0]).toMatchObject({ type: 'runCommand', confirmed: true });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
  }, 10000);

  it('show_widget draws the visual in the chat — no permission question, nothing executed', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ACTION_TOOL_DEFINITIONS } = await import('../ai/IntentRegistry');
    expect(ACTION_TOOL_DEFINITIONS.find((t) => t.name === 'show_widget')?.parameters).toMatchObject({ required: ['title', 'widget_code'] });
    let calls = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(_request, callbacks) {
        calls += 1;
        if (calls === 1) {
          callbacks.onToolCall?.({ id: 'w-1', name: 'show_widget', arguments: { title: 'sales_chart', widget_code: '<svg viewBox="0 0 10 10"></svg>', loading_messages: ['Drawing the bars', 7] } });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('Sales doubled.');
          callbacks.onComplete('Sales doubled.');
        }
        return { cancel: () => {} };
      },
    };
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const saved: { widgets?: unknown }[] = [];
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction,
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
      persistTurn: async (turn) => {
        saved.push({ widgets: turn.widgets });
        return { id: 'session-1' } as never;
      },
    });

    runtime.submitTranscript('chart my sales');
    for (let i = 0; i < 60 && !runtime.getSnapshot().messages.some((m) => m.content === 'Sales doubled.'); i += 1) await Promise.resolve();

    const widget = runtime.getSnapshot().messages.find((m) => m.widget);
    const expected = { title: 'sales_chart', code: '<svg viewBox="0 0 10 10"></svg>', loadingMessages: ['Drawing the bars'] };
    expect(widget?.widget).toEqual(expected);
    for (let i = 0; i < 60 && saved.length === 0; i += 1) await Promise.resolve();
    expect(saved[0]?.widgets).toEqual([expected]); // saved with the chat
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
    expect(executeAction.mock.calls.filter(([r]) => (r as { type?: string }).type !== 'recordTaskProvenance')).toHaveLength(0);
    expect(runtime.getSnapshot().messages.some((m) => m.content === 'Sales doubled.')).toBe(true);
  }, 10000);

  it('present_resume shows the resume in chat for download — nothing is saved, no permission question', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    let calls = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(_request, callbacks) {
        calls += 1;
        if (calls === 1) {
          callbacks.onToolCall?.({
            id: 'r-1',
            name: 'present_resume',
            arguments: { title: 'Asha — Resume', sections: [{ heading: 'Asha Rao', paragraphs: ['asha@example.com'] }, { heading: 'Skills', paragraphs: ['TypeScript'] }] },
          });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('Here it is — want any changes?');
          callbacks.onComplete('Here it is — want any changes?');
        }
        return { cancel: () => {} };
      },
    };
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction,
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
    });

    runtime.setProjectFolder('C:\\code\\my-app'); // an open coding project must not matter
    runtime.submitTranscript('make my resume');
    for (let i = 0; i < 60 && !runtime.getSnapshot().messages.some((m) => m.content.startsWith('Here it is')); i += 1) await Promise.resolve();

    const shown = runtime.getSnapshot().messages.find((m) => m.resume);
    expect(shown?.resume).toEqual({ title: 'Asha — Resume', sections: [{ heading: 'Asha Rao', paragraphs: ['asha@example.com'] }, { heading: 'Skills', paragraphs: ['TypeScript'] }] });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
    expect(executeAction.mock.calls.filter(([r]) => (r as { type?: string }).type !== 'recordTaskProvenance')).toHaveLength(0);
  }, 10000);

  it('the open project folder is sent to the AI with every message; closing it stops that', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const seen: string[] = [];
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        seen.push(request.input);
        callbacks.onDelta('ok');
        callbacks.onComplete('ok');
        return { cancel: () => {} };
      },
    };
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
    });

    runtime.setProjectFolder('C:\\code\\my-app');
    runtime.submitTranscript('fix the login bug');
    await waitForIdle(runtime);
    expect(seen[0]).toMatch(/^\[Open project folder: C:\\code\\my-app — use it as the default folder/);
    expect(seen[0]).toContain('fix the login bug');

    runtime.setProjectFolder(null);
    runtime.submitTranscript('hello');
    for (let i = 0; i < 40 && seen.length < 2; i += 1) await Promise.resolve();
    expect(seen[1]).toBe('hello');
  }, 10000);

  it('"deny" skips it — the action never runs', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'manual', bypassPermissionsEnabled: false, executeAction });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);
    runtime.submitTranscript('deny');
    for (let i = 0; i < 50; i += 1) await Promise.resolve();

    expect(calledForType(executeAction, 'runCommand')).toHaveLength(0);
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
  }, 10000);

  it('Bypass mode ON still cannot bypass a real backend entitlement/security refusal — the mode only supplies "yes", it never fabricates success', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({
      ok: false,
      reason: 'entitlement-restricted',
      message: 'Your plan does not include this capability.',
    }));
    const runtime = await createRuntime({ toolName: 'run_command', executionMode: 'bypass', bypassPermissionsEnabled: true, executeAction });
    // Finished task cards leave the chat for Work History — capture the finalized card as published.
    let task: ConversationTaskRecord | undefined;
    runtime.subscribe((snapshot) => {
      const card = snapshot.messages.find((m) => m.task)?.task;
      if (card) task = card;
    });

    runtime.submitTranscript('run the build');
    await waitForIdle(runtime);

    // The backend never returned requires-confirmation, so shouldAutoConfirmAction is never
    // consulted at all — executeAction is called exactly once for the real action, and the real
    // refusal stands (regardless of how many times the unrelated recordTaskProvenance fires).
    expect(calledForType(executeAction, 'runCommand')).toHaveLength(1);
    expect(task?.actions[0]?.result).toMatchObject({ ok: false, reason: 'entitlement-restricted' });
  }, 10000);
});
