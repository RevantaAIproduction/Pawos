import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ExecutionCancelResult } from '../../shared/actions/ExecutionLifecycle';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import type { SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';

/**
 * The real ConversationRuntime, with a scripted model and a controllable executeAction: execution
 * ids on actions, Cancelling until the main process confirms, late results discarded, and the
 * active-task view the controller uses for background navigation.
 */

const stt: SpeechRecognitionProvider = { name: 'stt', isSupported: () => true, start: async (cb) => ({ stop: () => cb.onEnd?.(), cancel: () => {} }) };
const tts: TextToSpeechProvider = { name: 'tts', supportsVisemes: false, isSupported: () => true, speak: async () => {}, stop: () => {} };

/** First call: one run_command tool call. Later calls: plain text (a real model reacting to the result). */
function oneToolCallModel(): { provider: ReasoningProvider; calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    provider: {
      id: 'test',
      label: 'Test',
      isSupported: () => true,
      streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
        calls += 1;
        if (calls === 1) {
          callbacks.onToolCall?.({ id: 'tool-1', name: 'run_command', arguments: { command: 'npm test', cwd: 'C:\\project' } });
          callbacks.onComplete('');
        } else {
          callbacks.onDelta('All tests pass.');
          callbacks.onComplete('All tests pass.');
        }
        return { cancel: () => {} };
      },
    },
  };
}

const flush = async (rounds = 30) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

async function createRuntime(opts: {
  executeAction: (request: ActionRequest) => Promise<ActionResult>;
  cancelExecution?: (executionId: string) => Promise<ExecutionCancelResult>;
  onCancelSettled?: (listener: (executionId: string) => void) => () => void;
  autonomousRunId?: string;
}) {
  const { ConversationRuntime } = await import('./ConversationRuntime');
  const model = oneToolCallModel();
  const records: ExecutionRecord[] = [];
  const runtime = new ConversationRuntime({
    speechRecognition: stt,
    speechSynthesis: tts,
    reasoningRuntime: new ReasoningRuntime(model.provider),
    executeAction: opts.executeAction,
    cancelExecution: opts.cancelExecution,
    onCancelSettled: opts.onCancelSettled,
    persistExecution: (record) => {
      records.push(record);
    },
    describeAction: async () => 'Running npm test…',
    reportActionResult: async (_request, result) => (result.ok ? 'Done.' : result.message ?? 'Stopped.'),
    getExecutionMode: () => 'bypass',
    isBypassPermissionsEnabled: () => true,
    ...(opts.autonomousRunId ? { autonomousRunId: opts.autonomousRunId } : {}),
  });
  const latest = (id?: string) => [...records].reverse().find((r) => !id || r.id === id);
  return { runtime, model, records, latest };
}

const commandCalls = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.map(([r]) => r as ActionRequest).filter((r) => r.type === 'runCommand');

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

describe('execution ids on actions', () => {
  it('every action the turn runs carries that turn’s execution id (confirmed path)', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true, data: { output: 'ok' } }));
    const { runtime, latest } = await createRuntime({ executeAction });
    runtime.submitTranscript('run the tests');
    await flush();
    const [call] = commandCalls(executeAction);
    expect(call.executionId).toBeTruthy();
    expect(latest(call.executionId)?.goal).toBe('run the tests');
    expect(latest(call.executionId)?.status).toBe('completed');
  });

  it('…and on the direct (no-confirmation) path', async () => {
    const executeAction = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    const { runtime, latest } = await createRuntime({ executeAction, autonomousRunId: 'run-1' });
    runtime.submitTranscript('run the tests');
    await flush();
    const [call] = commandCalls(executeAction);
    expect(call.executionId).toBeTruthy();
    expect(latest(call.executionId)?.timeline).toHaveLength(1);
  });
});

describe('cancelling a running task', () => {
  it('Cancelling until the main process confirms; the late result is discarded and the model is not continued', async () => {
    const step = deferred<ActionResult>();
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? step.promise : { ok: true }));
    const confirmation = deferred<ExecutionCancelResult>();
    const cancelExecution = vi.fn(() => confirmation.promise);
    const { runtime, model, latest } = await createRuntime({ executeAction, cancelExecution });

    runtime.submitTranscript('run the tests');
    await flush();
    const [call] = commandCalls(executeAction);
    const executionId = call.executionId!;
    expect(runtime.getActiveTask()).toMatchObject({ goal: 'run the tests', executionId });

    runtime.cancel();
    expect(cancelExecution).toHaveBeenCalledWith(executionId);
    expect(latest(executionId)?.status).toBe('cancelling');
    expect(runtime.getSnapshot().taskHistory?.at(-1)?.status).toBe('cancelling');
    expect(runtime.getActiveTask()).toBeNull();

    // The step returns after the cancel (it could not be stopped in time) — it must not count.
    step.resolve({ ok: true, data: { output: 'late' } });
    await flush();
    expect(model.calls()).toBe(1);
    expect(latest(executionId)?.commandEvidence).toEqual([]);
    expect(runtime.getSnapshot().taskHistory?.at(-1)?.actions[0].result).toBeUndefined();

    confirmation.resolve({ confirmed: true, hadRunningAction: true, runningActionType: 'runCommand', stopped: 1, nonCancellable: false, stillRunning: null });
    await flush();
    expect(latest(executionId)?.status).toBe('cancelled');
    expect(runtime.getSnapshot().taskHistory?.at(-1)).toMatchObject({ status: 'cancelled', finalReport: 'Cancelled.' });
  });

  it('a step that cannot be stopped: stays Cancelling with what is still running, re-asks a bounded number of times', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? new Promise<ActionResult>(() => {}) : { ok: true }));
    const cancelExecution = vi.fn(async (): Promise<ExecutionCancelResult> => ({
      confirmed: false,
      hadRunningAction: true,
      runningActionType: 'runCommand',
      stopped: 0,
      nonCancellable: true,
      stillRunning: { actionType: 'runCommand', startedAt: 1 },
    }));
    const { runtime, latest } = await createRuntime({ executeAction, cancelExecution });
    runtime.submitTranscript('run the tests');
    await flush();
    const executionId = commandCalls(executeAction)[0].executionId!;
    runtime.cancel();
    await flush();
    expect(cancelExecution).toHaveBeenCalledTimes(4);
    expect(latest(executionId)?.status).toBe('cancelling');
    expect(latest(executionId)?.cancellation).toMatchObject({ stillRunningAction: 'runCommand' });
    expect(runtime.getSnapshot().taskHistory?.at(-1)?.finalReport).toMatch(/still waiting for runCommand to stop/);
  });

  it('cancelling only ever targets this task’s own execution', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? new Promise<ActionResult>(() => {}) : { ok: true }));
    const cancelExecution = vi.fn(async (): Promise<ExecutionCancelResult> => ({ confirmed: true, hadRunningAction: true, runningActionType: 'runCommand', stopped: 1, nonCancellable: false, stillRunning: null }));
    const { runtime } = await createRuntime({ executeAction, cancelExecution });
    runtime.submitTranscript('run the tests');
    await flush();
    const executionId = commandCalls(executeAction)[0].executionId!;
    runtime.cancel();
    runtime.cancel(); // a second press: nothing new to cancel
    await flush();
    expect(cancelExecution.mock.calls.map(([id]) => id)).toEqual([executionId]);
  });

  it('cancelling with nothing running cancels nothing in the main process', async () => {
    const cancelExecution = vi.fn();
    const { runtime } = await createRuntime({ executeAction: vi.fn(async () => ({ ok: true })), cancelExecution });
    runtime.cancel();
    expect(cancelExecution).not.toHaveBeenCalled();
  });
});

describe('M2: a step that could not be stopped in time', () => {
  it('stays Cancelling — never reported cancelled early — and becomes Cancelled when main says it really stopped', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? new Promise<ActionResult>(() => {}) : { ok: true }));
    let stillRunning = true;
    const cancelExecution = vi.fn(async (): Promise<ExecutionCancelResult> =>
      stillRunning
        ? { confirmed: false, hadRunningAction: true, runningActionType: 'runCommand', stopped: 0, nonCancellable: true, stillRunning: { actionType: 'runCommand', startedAt: 1 } }
        : { confirmed: true, hadRunningAction: false, runningActionType: null, stopped: 0, nonCancellable: false, stillRunning: null }
    );
    const listeners = new Set<(id: string) => void>();
    const onCancelSettled = vi.fn((listener: (id: string) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    });
    const { runtime, latest } = await createRuntime({ executeAction, cancelExecution, onCancelSettled });
    runtime.submitTranscript('run the tests');
    await flush();
    const executionId = commandCalls(executeAction)[0].executionId!;
    runtime.cancel();
    await flush();
    expect(latest(executionId)?.status).toBe('cancelling');
    expect(listeners.size).toBe(1);

    // Another execution settling changes nothing.
    for (const listener of [...listeners]) listener('some-other-execution');
    await flush();
    expect(latest(executionId)?.status).toBe('cancelling');

    // The step finally returns in main: the settled event arrives.
    stillRunning = false;
    for (const listener of [...listeners]) listener(executionId);
    await flush();
    expect(latest(executionId)?.status).toBe('cancelled');
    expect(listeners.size).toBe(0); // unsubscribed
  });

  it('it settled just before the subscription: the immediate re-check confirms it', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? new Promise<ActionResult>(() => {}) : { ok: true }));
    let calls = 0;
    const cancelExecution = vi.fn(async (): Promise<ExecutionCancelResult> => {
      calls += 1;
      return calls <= 4
        ? { confirmed: false, hadRunningAction: true, runningActionType: 'runCommand', stopped: 0, nonCancellable: true, stillRunning: { actionType: 'runCommand', startedAt: 1 } }
        : { confirmed: true, hadRunningAction: false, runningActionType: null, stopped: 0, nonCancellable: false, stillRunning: null };
    });
    const { runtime, latest } = await createRuntime({ executeAction, cancelExecution, onCancelSettled: () => () => {} });
    runtime.submitTranscript('run the tests');
    await flush();
    const executionId = commandCalls(executeAction)[0].executionId!;
    runtime.cancel();
    await flush();
    expect(latest(executionId)?.status).toBe('cancelled');
  });
});

describe('retry never overlaps a running task', () => {
  it('a retry while a task runs is refused (nothing is sent)', async () => {
    const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? new Promise<ActionResult>(() => {}) : { ok: true }));
    const { runtime } = await createRuntime({ executeAction });
    runtime.submitTranscript('run the tests');
    await flush();
    const sentBefore = executeAction.mock.calls.length;
    const task = runtime.getSnapshot().taskHistory?.at(-1);
    await runtime.retryTaskAction(task!.id, task!.actions[0].id);
    expect(executeAction.mock.calls.length).toBe(sentBefore);
  });
});
