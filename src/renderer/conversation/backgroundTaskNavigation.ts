/**
 * Chat navigation while a task runs (one active task per window — no concurrent tasks).
 *
 * The runtime stays on the task's own chat for as long as the task runs: its live messages, its
 * saved turns and its project folder never move. Opening any other chat (or a new one) meanwhile
 * only *views* that chat read-only. Returning to the task's chat stops viewing. Once the task has
 * ended (completed, failed, cancelled), the chat being viewed becomes the real, active chat.
 * Starting a new request while viewing another chat is refused with a clear explanation — the
 * running task is never silently replaced.
 */

export type ActiveTaskInfo = {
  goal: string;
  executionId: string | null;
  sessionId: string | null;
  startedAt: number;
  waitingForApproval: boolean;
};

/** What opening a chat does. `targetId` null = a new chat. */
export type ChatOpenDecision = 'switch' | 'view' | 'return';

export function decideChatOpen(activeTask: ActiveTaskInfo | null, taskChatId: string | null, targetId: string | null): ChatOpenDecision {
  if (!activeTask) return 'switch';
  // The task's own chat (a saved one) — go back to it.
  if (targetId !== null && targetId === taskChatId) return 'return';
  return 'view';
}

/** A new request typed while viewing another chat during a task is refused (the draft is kept). */
export function decideSubmit(activeTask: ActiveTaskInfo | null, viewingOtherChat: boolean): 'submit' | 'blocked' {
  return activeTask && viewingOtherChat ? 'blocked' : 'submit';
}

/** Once the task has ended, the viewed chat (if any) is opened for real. */
export function shouldHandOffToViewedChat(activeTask: ActiveTaskInfo | null, viewingOtherChat: boolean): boolean {
  return !activeTask && viewingOtherChat;
}

export const TASK_ALREADY_RUNNING_MESSAGE =
  'PawOS is already working on a task in another chat. Return to it to follow along, or cancel it to start something new here.';
