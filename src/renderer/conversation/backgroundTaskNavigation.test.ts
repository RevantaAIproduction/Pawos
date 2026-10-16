import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';
import type { ExecutionCancelResult } from '../../shared/actions/ExecutionLifecycle';
import type { ConversationSession } from '../../shared/conversation/ConversationSessionTypes';
import type { SessionContinuationHint } from '../../shared/conversation/ConversationSessionTypes';
import type { ConversationTurnRecord } from './ConversationTypes';
import type { SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';
import { decideChatOpen, decideSubmit, shouldHandOffToViewedChat, type ActiveTaskInfo } from './backgroundTaskNavigation';

/**
 * Background-task navigation: the decisions useConversationController makes, and — with the real
 * ConversationRuntime — that a task keeps running and saving into its own chat while another chat
 * is only viewed, then hands over once it ends.
 */

const task: ActiveTaskInfo = { goal: 'Fix the build', executionId: 'exec-1', sessionId: 'chat-A', startedAt: 1, waitingForApproval: false };

describe('decisions', () => {
  it('no task running: opening a chat switches to it, as before', () => {
    expect(decideChatOpen(null, 'chat-A', 'chat-B')).toBe('switch');
    expect(decideChatOpen(null, 'chat-A', null)).toBe('switch');
  });

  it('a task is running: another chat (or a new one) is only viewed; the task’s own chat is a return', () => {
    expect(decideChatOpen(task, 'chat-A', 'chat-B')).toBe('view');
    expect(decideChatOpen(task, 'chat-A', null)).toBe('view');
    expect(decideChatOpen(task, 'chat-A', 'chat-A')).toBe('return');
    expect(decideChatOpen({ ...task, waitingForApproval: true }, 'chat-A', 'chat-B')).toBe('view');
  });

  it('a second request from another chat is refused; the same chat keeps its existing behaviour', () => {
    expect(decideSubmit(task, true)).toBe('blocked');
    expect(decideSubmit(task, false)).toBe('submit');
    expect(decideSubmit(null, true)).toBe('submit');
  });

  it('M3: decided again after the chat loads — a task that ended meanwhile makes it a real switch, never a stale read-only view', () => {
    // Before loading: a task runs → view.
    expect(decideChatOpen(task, 'chat-A', 'chat-B')).toBe('view');
    // After loading (the task ended in the meantime): the controller re-decides → switch.
    expect(decideChatOpen(null, 'chat-A', 'chat-B')).toBe('switch');
    // And with no task, a submit is never blocked (it goes to the chat on screen, which is the runtime's own).
    expect(decideSubmit(null, true)).toBe('submit');
  });

  it('the viewed chat becomes the real one only once the task has ended', () => {
    expect(shouldHandOffToViewedChat(task, true)).toBe(false);
    expect(shouldHandOffToViewedChat(null, true)).toBe(true);
    expect(shouldHandOffToViewedChat(null, false)).toBe(false);
  });
});

// ── With the real runtime ──────────────────────────────────────────────────────────────────────

const stt: SpeechRecognitionProvider = { name: 'stt', isSupported: () => true, start: async (cb) => ({ stop: () => cb.onEnd?.(), cancel: () => {} }) };
const tts: TextToSpeechProvider = { name: 'tts', supportsVisemes: false, isSupported: () => true, speak: async () => {}, stop: () => {} };

function oneToolCallModel(): ReasoningProvider {
  let calls = 0;
  return {
    id: 'test',
    label: 'Test',
    isSupported: () => true,
    streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      calls += 1;
      if (calls === 1) {
        callbacks.onToolCall?.({ id: 'tool-1', name: 'run_command', arguments: { command: 'npm run build', cwd: 'C:\\project' } });
        callbacks.onComplete('');
      } else {
        callbacks.onDelta('Build fixed.');
        callbacks.onComplete('Build fixed.');
      }
      return { cancel: () => {} };
    },
  };
}

const flush = async (rounds = 30) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const session = (id: string): ConversationSession =>
  ({ id, title: id, createdAt: 1, updatedAt: 1, turns: [{ id: `${id}-t1`, transcript: `earlier in ${id}`, assistantResponse: 'ok', startedAt: 1, endedAt: 2, actionsExecuted: [], errors: [], endedReason: 'completed' }] }) as unknown as ConversationSession;

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});

async function runtimeWithStep(step: Promise<ActionResult>, cancelExecution?: (id: string) => Promise<ExecutionCancelResult>) {
  const { ConversationRuntime } = await import('./ConversationRuntime');
  const persisted: { turn: ConversationTurnRecord; hint: SessionContinuationHint }[] = [];
  const executeAction = vi.fn(async (request: ActionRequest): Promise<ActionResult> => (request.type === 'runCommand' ? step : { ok: true }));
  const runtime = new ConversationRuntime({
    speechRecognition: stt,
    speechSynthesis: tts,
    reasoningRuntime: new ReasoningRuntime(oneToolCallModel()),
    executeAction,
    cancelExecution,
    persistTurn: async (turn, hint) => {
      persisted.push({ turn, hint });
      return { id: hint.type === 'continue' ? hint.sessionId : 'chat-new' };
    },
    describeAction: async () => 'Building…',
    reportActionResult: async (_r, result) => (result.ok ? 'Done.' : 'Stopped.'),
    getExecutionMode: () => 'bypass',
    isBypassPermissionsEnabled: () => true,
  });
  return { runtime, persisted, executeAction };
}

describe('switching chats while a task runs (real runtime)', () => {
  it('the task keeps running while another chat is viewed, finishes in its own chat, then the viewed chat opens', async () => {
    let finishStep!: (result: ActionResult) => void;
    const step = new Promise<ActionResult>((resolve) => (finishStep = resolve));
    const { runtime, persisted } = await runtimeWithStep(step);
    runtime.openConversation(session('chat-A'));
    runtime.submitTranscript('fix the build');
    await flush();

    // The user opens chat B: the controller only views it — the runtime is not switched.
    const active = runtime.getActiveTask();
    expect(active).toMatchObject({ goal: 'fix the build', sessionId: 'chat-A' });
    expect(decideChatOpen(active, 'chat-A', 'chat-B')).toBe('view');
    // …and typing a new request there is refused rather than replacing the task.
    expect(decideSubmit(active, true)).toBe('blocked');

    finishStep({ ok: true, data: { output: 'built' } });
    await flush();

    // The task completed and was saved into its own chat — not chat B.
    expect(runtime.getActiveTask()).toBeNull();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].hint).toEqual({ type: 'continue', sessionId: 'chat-A' });
    expect(persisted[0].turn.assistantResponse).toBe('Build fixed.');
    expect(runtime.getSnapshot().taskHistory?.at(-1)?.status).toBe('completed');

    // Now the viewed chat becomes the real one.
    expect(shouldHandOffToViewedChat(runtime.getActiveTask(), true)).toBe(true);
    runtime.openConversation(session('chat-B'));
    expect(runtime.getSnapshot().messages.some((m) => m.content === 'earlier in chat-B')).toBe(true);
  });

  it('returning to the task’s chat shows its live task state', async () => {
    const { runtime } = await runtimeWithStep(new Promise<ActionResult>(() => {}));
    runtime.openConversation(session('chat-A'));
    runtime.submitTranscript('fix the build');
    await flush();
    const active = runtime.getActiveTask();
    expect(decideChatOpen(active, 'chat-A', 'chat-A')).toBe('return');
    // Nothing about the runtime changed while another chat was viewed: the running step is still there.
    const task = runtime.getSnapshot().taskHistory?.at(-1);
    expect(task?.status).toBe('running');
    expect(task?.actions[0]).toMatchObject({ type: 'runCommand', endedAt: null });
  });

  it('opening a chat when nothing runs still switches the runtime, as before', async () => {
    const { runtime } = await runtimeWithStep(Promise.resolve({ ok: true }));
    runtime.openConversation(session('chat-A'));
    expect(decideChatOpen(runtime.getActiveTask(), 'chat-A', 'chat-B')).toBe('switch');
    runtime.openConversation(session('chat-B'));
    expect(runtime.getSnapshot().messages.some((m) => m.content === 'earlier in chat-B')).toBe(true);
  });
});

describe('same-chat behaviour is unchanged', () => {
  it('typing a new request in the task’s own chat still interrupts it (explicit barge-in) — and now also stops its main-process work', async () => {
    const cancelExecution = vi.fn(async (): Promise<ExecutionCancelResult> => ({ confirmed: true, hadRunningAction: true, runningActionType: 'runCommand', stopped: 1, nonCancellable: false, stillRunning: null }));
    const { runtime, executeAction } = await runtimeWithStep(new Promise<ActionResult>(() => {}), cancelExecution);
    runtime.openConversation(session('chat-A'));
    runtime.submitTranscript('fix the build');
    await flush();
    const executionId = (executeAction.mock.calls.map(([r]) => r as ActionRequest).find((r) => r.type === 'runCommand'))!.executionId;
    expect(decideSubmit(runtime.getActiveTask(), false)).toBe('submit');

    runtime.submitTranscript('actually, stop and explain the error');
    await flush();
    expect(cancelExecution).toHaveBeenCalledWith(executionId);
  });
});
