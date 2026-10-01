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

  it('one answer can draw several different visuals (up to 3); a redraw of one already shown is refused', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const draws = [
      { title: 'Revenue chart', widget_code: '<svg viewBox="0 0 10 10"><rect/></svg>' },
      { title: 'Pipeline diagram', widget_code: '<svg viewBox="0 0 10 10"><circle/></svg>' },
      { title: 'Revenue Chart (v2)', widget_code: '<svg viewBox="0 0 10 10"><rect x="1"/></svg>' }, // redraw by title
      { title: 'Something else', widget_code: '<svg viewBox="0 0 10 10"><circle/></svg>' }, // redraw by code
      { title: 'Team table', widget_code: '<div>team</div>' },
      { title: 'Region map', widget_code: '<div>map</div>' }, // over the limit
    ];
    const replies: string[] = [];
    let calls = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        const draw = draws[calls];
        calls += 1;
        if (calls > 1) replies.push(JSON.stringify(request));
        if (draw) {
          callbacks.onToolCall?.({ id: `w-${calls}`, name: 'show_widget', arguments: draw });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('Here are the visuals.');
          callbacks.onComplete('Here are the visuals.');
        }
        return { cancel: () => {} };
      },
    };
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
    });

    runtime.submitTranscript('chart revenue, diagram the pipeline and show the team');
    for (let i = 0; i < 200 && !runtime.getSnapshot().messages.some((m) => m.content === 'Here are the visuals.'); i += 1) await Promise.resolve();

    expect(runtime.getSnapshot().messages.filter((m) => m.widget).map((m) => m.widget!.title)).toEqual(['Revenue chart', 'Pipeline diagram', 'Team table']);
    expect(replies.join('')).toContain('already on screen for this answer');
    expect(replies.join('')).toContain('already shows 3 visuals');
  }, 10000);

  it('two tool calls in ONE response: both run, then the model continues once with both results after its call', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const requests: { history: { role: string; toolCallId?: string; toolCalls?: { id: string }[] }[] }[] = [];
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        requests.push(request as never);
        if (requests.length === 1) {
          callbacks.onToolCall?.({ id: 'a', name: 'show_widget', arguments: { title: 'Price chart', widget_code: '<div>Go Pro Max</div>' } });
          callbacks.onToolCall?.({ id: 'b', name: 'show_widget', arguments: { title: 'Signup flow', widget_code: '<div>Download then sign in</div>' } });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('Both are above.');
          callbacks.onComplete('Both are above.');
        }
        return { cancel: () => {} };
      },
    };
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
    });

    runtime.submitTranscript('chart the prices and draw the signup flow');
    for (let i = 0; i < 200 && !runtime.getSnapshot().messages.some((m) => m.content === 'Both are above.'); i += 1) await Promise.resolve();

    expect(runtime.getSnapshot().messages.filter((m) => m.widget).map((m) => m.widget!.title)).toEqual(['Price chart', 'Signup flow']);
    expect(requests).toHaveLength(2); // one continuation, not one per tool call
    const history = requests[1]!.history;
    const callAt = history.findIndex((m) => m.toolCalls?.length === 2);
    expect(callAt).toBeGreaterThanOrEqual(0);
    expect(history.slice(callAt + 1).map((m) => m.toolCallId)).toEqual(['a', 'b']);
  }, 10000);

  it('reopening a past chat: messages and visuals back on screen, the AI remembers it, new turns saved into it; New chat starts clean', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const seen: { history: { role: string; content: string }[] }[] = [];
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        seen.push(request as never);
        callbacks.onDelta('Sure.');
        callbacks.onComplete('Sure.');
        return { cancel: () => {} };
      },
    };
    const hints: unknown[] = [];
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
      persistTurn: async (_turn, hint) => {
        hints.push(hint);
        return { id: (hint as { sessionId?: string }).sessionId ?? 'brand-new' };
      },
      resolveSession: async () => ({ type: 'continue', sessionId: 'some-old-chat' }),
    });

    const widget = { title: 'Sales chart', code: '<svg viewBox="0 0 1 1"></svg>' };
    runtime.openConversation({
      id: 'chat-1',
      title: 'Sales',
      turns: [{ id: 't1', transcript: 'chart my sales', assistantResponse: 'Sales doubled.', startedAt: 1, endedAt: 2, widgets: [widget] }],
    } as never);
    expect(runtime.getSnapshot().messages.map((m) => m.content || m.widget?.title)).toEqual(['chart my sales', 'Sales chart', 'Sales doubled.']);

    runtime.submitTranscript('and last year?');
    for (let i = 0; i < 100 && hints.length === 0; i += 1) await Promise.resolve();
    expect(seen[0]!.history.map((m) => `${m.role}:${m.content}`)).toEqual(['user:chart my sales', 'assistant:Sales doubled.']);
    expect(hints[0]).toEqual({ type: 'continue', sessionId: 'chat-1' });

    runtime.openConversation(null); // New chat
    expect(runtime.getSnapshot().messages).toEqual([]);
    // Not a greeting — greetings are answered locally without reaching the model (smallTalk.ts).
    runtime.submitTranscript('what can you do?');
    for (let i = 0; i < 100 && hints.length < 2; i += 1) await Promise.resolve();
    expect(seen[1]!.history).toEqual([]);
    expect(hints[1]).toEqual({ type: 'new' }); // never filed into an old chat
  }, 10000);

  it('capture_evidence: before/after screenshots shown in chat side by side, output as a labelled code block; the model never gets image bytes', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const IMG = 'iVBORw0KGgoAAAANSUhEUg==';
    const calls = [
      { name: 'capture_evidence', arguments: { phase: 'before', label: 'Cart overflows on mobile', provider: 'web', url: 'http://localhost:5173/cart' } },
      { name: 'capture_evidence', arguments: { phase: 'after', label: 'Cart fits on mobile', provider: 'web', url: 'http://localhost:5173/cart/' } },
      { name: 'capture_evidence', arguments: { phase: 'before', label: 'Price test fails', provider: 'output', command: 'npm test', cwd: 'C:\\code\\shop' } },
      { name: 'capture_evidence', arguments: { phase: 'before', label: 'Android', provider: 'android' } },
    ];
    const requests: string[] = [];
    let n = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        requests.push(JSON.stringify(request));
        const call = calls[n];
        n += 1;
        if (call) {
          callbacks.onToolCall?.({ id: `e-${n}`, ...call });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('Fixed.');
          callbacks.onComplete('Fixed.');
        }
        return { cancel: () => {} };
      },
    };
    let id = 0;
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
      if (request.type !== 'captureEvidence') return { ok: true };
      id += 1;
      if (request.target.provider === 'android') return { ok: true, data: { unavailable: true, message: 'adb is not installed. Evidence is optional.' } };
      if (request.target.provider === 'output') {
        return { ok: true, data: { evidence: { id: `ev${id}`, phase: 'before', label: request.label, provider: 'output', kind: 'output', capturedAt: 1, filePath: 'C:\\e\\o.txt', targetDescription: 'npm test', output: { source: 'npm test', status: 1, text: 'Expected 30, got NaN' } } } };
      }
      return {
        ok: true,
        data: {
          evidence: { id: `ev${id}`, phase: request.phase, label: request.label, provider: 'web', kind: 'image', capturedAt: 1, filePath: `C:\\e\\${request.phase}.png`, targetDescription: request.target.provider === 'web' ? request.target.url : '' },
          imageBase64: IMG,
        },
      };
    });
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction,
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
      autonomousRunId: 'run-1', // a headless ticket run — no permission questions
    });

    runtime.submitTranscript('fix ticket SHOP-12');
    for (let i = 0; i < 400 && !runtime.getSnapshot().messages.some((m) => m.content === 'Fixed.'); i += 1) await Promise.resolve();

    const shown = runtime.getSnapshot().messages.filter((m) => m.evidence);
    expect(shown.map((m) => [m.evidence!.phase, m.evidence!.label, Boolean(m.evidence!.before)])).toEqual([
      ['before', 'Cart overflows on mobile', false],
      ['after', 'Cart fits on mobile', true], // same page (trailing slash ignored) → shown beside its before
    ]);
    expect(shown[1]!.evidence!.imageDataUrl).toBe(`data:image/png;base64,${IMG}`);
    const output = runtime.getSnapshot().messages.find((m) => m.content.startsWith('Output evidence'));
    expect(output?.content).toContain('Output evidence — before · `npm test` · exit code 1');
    expect(output?.content).toContain('```text\nExpected 30, got NaN\n```');
    expect(output?.evidence).toBeUndefined(); // text evidence is never shown as a screenshot
    expect(runtime.getSnapshot().messages.filter((m) => m.id.startsWith('evidence-'))).toHaveLength(3); // unavailable Android: nothing shown
    expect(requests.join('')).not.toContain(IMG);
    expect(requests.join('')).toContain('shownInChat');
  }, 10000);

  it('evidence Phase 2: saved to the run, inspect_evidence gives the model the actual image, turn keeps references only, reopened chat restores it', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { restoreConversationSnapshot } = await import('./RestoreConversationAdapter');
    const IMG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const seen: { history: { role: string; images?: unknown[]; content: string }[] }[] = [];
    const script = [
      { name: 'capture_evidence', arguments: { phase: 'before', label: 'Checkout overflows', provider: 'web', url: 'http://localhost:5173/checkout' } },
      { name: 'inspect_evidence', arguments: { phase: 'before' } },
    ];
    let n = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        seen.push(request as never);
        const call = script[n];
        n += 1;
        if (call) {
          callbacks.onToolCall?.({ id: `c-${n}`, ...call });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('The banner is wider than the page.');
          callbacks.onComplete('The banner is wider than the page.');
        }
        return { cancel: () => {} };
      },
    };
    const saved: { runId: string | undefined; id: string; image: string | undefined }[] = [];
    const turns: ConversationTurnRecord[] = [];
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (request: ActionRequest): Promise<ActionResult> => {
        if (request.type !== 'captureEvidence') return { ok: true };
        return {
          ok: true,
          data: {
            evidence: { id: 'ev-1', phase: 'before', label: request.label, provider: 'web', kind: 'image', capturedAt: 1, filePath: 'C:\\e\\ev-1-before.png', targetDescription: 'http://localhost:5173/checkout' },
            imageBase64: IMG,
          },
        };
      }),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
      autonomousRunId: 'run-9',
      onEvidenceCaptured: (evidence, image) => saved.push({ runId: 'run-9', id: evidence.id, image }),
      persistTurn: async (turn) => {
        turns.push(JSON.parse(JSON.stringify(turn)));
        return { id: 'session-9' };
      },
    });

    runtime.submitTranscript('fix ticket SHOP-12');
    for (let i = 0; i < 400 && turns.length === 0; i += 1) await Promise.resolve();

    expect(saved).toEqual([{ runId: 'run-9', id: 'ev-1', image: IMG }]); // durable copy handed to the run
    const inspectResult = seen[2]!.history.find((m) => m.role === 'tool' && m.content.includes('attached to this result as an image'));
    expect(inspectResult?.images).toEqual([{ mimeType: 'image/png', data: IMG }]); // the model actually gets the image
    expect(JSON.stringify(turns[0]!.evidence)).not.toContain(IMG); // chat history keeps references only
    expect(turns[0]!.evidence).toEqual([expect.objectContaining({ id: 'ev-1', phase: 'before', kind: 'image', runId: 'run-9' })]);

    // Reopen: the evidence message comes back (image loads on demand) and inspect_evidence still works via the loader.
    const session = { id: 'session-9', title: 'x', createdAt: 1, updatedAt: 1, pinned: false, archived: false, turns, filesCreated: [], applicationsOpened: [] };
    const restored = restoreConversationSnapshot(session as never)!;
    expect(restored.messages.find((m) => m.evidence)?.evidence).toMatchObject({ evidenceId: 'ev-1', runId: 'run-9', imageDataUrl: '' });

    const loader = vi.fn(async () => IMG);
    const reopenedSeen: { history: { role: string; images?: unknown[] }[] }[] = [];
    let m = 0;
    const reopened = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime({
        id: 'test-reasoning',
        label: 'Test Reasoning',
        isSupported: () => true,
        streamResponse(request, callbacks) {
          reopenedSeen.push(request as never);
          m += 1;
          if (m === 1) {
            callbacks.onToolCall?.({ id: 'r-1', name: 'inspect_evidence', arguments: { evidenceId: 'ev-1' } });
            callbacks.onComplete('');
          } else {
            callbacks.onDelta('Seen.');
            callbacks.onComplete('Seen.');
          }
          return { cancel: () => {} };
        },
      }),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
      loadEvidenceImage: loader,
    });
    reopened.openConversation(session as never);
    reopened.submitTranscript('look at the before screenshot again');
    for (let i = 0; i < 400 && !reopened.getSnapshot().messages.some((x) => x.content === 'Seen.'); i += 1) await Promise.resolve();
    expect(loader).toHaveBeenCalledWith({ evidenceId: 'ev-1', runId: 'run-9' });
    expect(reopenedSeen[1]!.history.find((x) => x.role === 'tool')?.images).toEqual([{ mimeType: 'image/png', data: IMG }]);
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

    runtime.setResumesAllowed(true); // PawOS Build
    runtime.setProjectFolder('C:\\code\\my-app'); // an open coding project must not matter
    runtime.submitTranscript('make my resume');
    for (let i = 0; i < 60 && !runtime.getSnapshot().messages.some((m) => m.content.startsWith('Here it is')); i += 1) await Promise.resolve();

    const shown = runtime.getSnapshot().messages.find((m) => m.resume);
    expect(shown?.resume).toEqual({ title: 'Asha — Resume', sections: [{ heading: 'Asha Rao', paragraphs: ['asha@example.com'] }, { heading: 'Skills', paragraphs: ['TypeScript'] }] });
    expect(runtime.getSnapshot().pendingConfirmation).toBe(false);
    expect(executeAction.mock.calls.filter(([r]) => (r as { type?: string }).type !== 'recordTaskProvenance')).toHaveLength(0);
  }, 10000);

  it('present_resume on a plan without resume building (not PawOS Build): nothing shown, the AI is told why', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const toolResults: string[] = [];
    let calls = 0;
    const provider: ReasoningProvider = {
      id: 'test-reasoning',
      label: 'Test Reasoning',
      isSupported: () => true,
      streamResponse(request, callbacks) {
        calls += 1;
        if (calls === 1) {
          callbacks.onToolCall?.({ id: 'r-1', name: 'present_resume', arguments: { title: 'Asha — Resume', sections: [{ heading: 'Asha Rao', paragraphs: ['asha@example.com'] }] } });
          callbacks.onComplete('');
        } else {
          toolResults.push(JSON.stringify(request));
          callbacks.onDelta('Resume building is available with PawOS Build.');
          callbacks.onComplete('Resume building is available with PawOS Build.');
        }
        return { cancel: () => {} };
      },
    };
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(),
      reasoningRuntime: new ReasoningRuntime(provider),
      executeAction: vi.fn(async (): Promise<ActionResult> => ({ ok: true })),
      getExecutionMode: () => 'manual',
      isBypassPermissionsEnabled: () => false,
    });

    runtime.submitTranscript('make my resume: Asha Rao, asha@example.com');
    for (let i = 0; i < 60 && !runtime.getSnapshot().messages.some((m) => m.content.startsWith('Resume building')); i += 1) await Promise.resolve();

    expect(runtime.getSnapshot().messages.some((m) => m.resume)).toBe(false);
    expect(toolResults.join('')).toContain('PawOS Build only');
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
    // Not a greeting — greetings are answered locally without reaching the model (smallTalk.ts).
    runtime.submitTranscript('what can you do?');
    for (let i = 0; i < 40 && seen.length < 2; i += 1) await Promise.resolve();
    expect(seen[1]).toBe('what can you do?');
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
