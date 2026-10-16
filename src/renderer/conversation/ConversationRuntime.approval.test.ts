import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import type { SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';

vi.setConfig({ testTimeout: 30_000 });

/**
 * A step that needs the user's "allow": the request's Work History record shows Awaiting approval
 * (not Failed), then settles on the user's answer — and the Tasks Center can tell which execution is
 * waiting (getActiveTask().executionId).
 */

const stt: SpeechRecognitionProvider = { name: 'stt', isSupported: () => true, start: async (cb) => ({ stop: () => cb.onEnd?.(), cancel: () => {} }) };
const tts: TextToSpeechProvider = { name: 'tts', supportsVisemes: false, isSupported: () => true, speak: async () => {}, stop: () => {} };

function writeFileModel(): ReasoningProvider {
  let calls = 0;
  return {
    id: 'test',
    label: 'Test',
    isSupported: () => true,
    streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      calls += 1;
      if (calls === 1) {
        callbacks.onToolCall?.({ id: 'tool-1', name: 'write_file', arguments: { path: 'C:\\project\\notes.txt', content: 'hello' } });
        callbacks.onComplete('');
      } else {
        callbacks.onDelta('Done.');
        callbacks.onComplete('Done.');
      }
      return { cancel: () => {} };
    },
  };
}

const flush = async (rounds = 30) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

async function waitingRuntime() {
  const { ConversationRuntime } = await import('./ConversationRuntime');
  const records: ExecutionRecord[] = [];
  const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> =>
    (request as { confirmed?: boolean }).confirmed ? { ok: true, data: { overwritten: false } } : { ok: false, reason: 'requires-confirmation', message: 'Write notes.txt?' }
  );
  const runtime = new ConversationRuntime({
    speechRecognition: stt,
    speechSynthesis: tts,
    reasoningRuntime: new ReasoningRuntime(writeFileModel()),
    executeAction,
    persistExecution: (record) => {
      records.push(record);
    },
    describeAction: async () => 'Writing notes.txt…',
    reportActionResult: async (_r, result) => (result.ok ? 'Done.' : 'Waiting.'),
    getExecutionMode: () => 'manual',
    isBypassPermissionsEnabled: () => false,
  });
  runtime.submitTranscript('write the notes');
  await flush();
  const latest = (id?: string) => [...records].reverse().find((r) => !id || r.id === id);
  const waitingId = latest()!.id;
  return { runtime, records, latest, waitingId, executeAction };
}

describe('a step waiting for approval', () => {
  it('is recorded as Awaiting approval — not Failed — and is the active task', async () => {
    const { runtime, latest, waitingId } = await waitingRuntime();
    expect(latest(waitingId)?.status).toBe('awaiting_approval');
    expect(runtime.getActiveTask()).toMatchObject({ waitingForApproval: true, executionId: waitingId });
  });

  it('allow: the waiting record completes and the step runs as the next request (its own execution)', async () => {
    const { runtime, latest, waitingId, executeAction } = await waitingRuntime();
    runtime.submitTranscript('allow');
    await flush();
    expect(latest(waitingId)?.status).toBe('completed');
    const confirmed = executeAction.mock.calls.map(([r]) => r as ActionRequest).find((r) => (r as { confirmed?: boolean }).confirmed);
    expect(confirmed?.executionId).toBeTruthy();
    expect(confirmed?.executionId).not.toBe(waitingId);
    // The approved step runs on a Task Card, linked to its own execution (the question itself came before any card).
    expect(latest(confirmed!.executionId)?.taskRecordId).toBeTruthy();
  });

  it('deny: cancelled, with the reason', async () => {
    const { runtime, latest, waitingId } = await waitingRuntime();
    runtime.submitTranscript('deny');
    await flush();
    expect(latest(waitingId)).toMatchObject({ status: 'cancelled', stoppedReason: 'You declined the step that needed approval.' });
  });

  it('cancel while waiting: cancelled by you', async () => {
    const { runtime, latest, waitingId } = await waitingRuntime();
    runtime.cancel();
    await flush();
    expect(latest(waitingId)).toMatchObject({ status: 'cancelled', stoppedReason: 'Cancelled by you while waiting for approval.' });
    expect(runtime.getActiveTask()).toBeNull();
  });
});
