import type { ConversationTaskAction, ConversationTaskRecord } from './ConversationTypes';

export type TaskPanelStatus = 'running' | 'waiting' | 'done' | 'failed' | 'stopped';

export type TaskPanelStep = {
  id: string;
  /** Terminal-style first line: the real command, or what the step did. */
  commandLine: string;
  /** Folder / file the step ran in or touched. */
  path?: string;
  status: 'running' | 'done' | 'failed' | 'waiting';
  output: string;
};

export type TaskPanelEntry = {
  id: string;
  goal: string;
  status: TaskPanelStatus;
  steps: TaskPanelStep[];
};

const COMMAND_TYPES = new Set(['runCommand', 'startProcess', 'runDeployScript', 'verifyToolInstalled']);

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stepFor(action: ConversationTaskAction): TaskPanelStep {
  const request = action.request as unknown as Record<string, unknown>;
  const result = action.result;
  const data = (result?.data ?? {}) as Record<string, unknown>;
  const command = str(request.command);
  const waiting = result?.ok === false && result.reason === 'requires-confirmation';
  const status: TaskPanelStep['status'] = !action.endedAt ? 'running' : waiting ? 'waiting' : result?.ok === false ? 'failed' : 'done';

  const output = !action.endedAt
    ? 'running…'
    : waiting
      ? 'Waiting for you to reply "allow" in chat.'
      : str(data.output) ?? (result?.ok === false ? str(result.message) : undefined) ?? action.doneText ?? '';

  return {
    id: action.id,
    commandLine: COMMAND_TYPES.has(action.type) && command ? command : action.doneText && action.endedAt ? action.doneText : action.inProgressText,
    path: str(request.cwd) ?? str(request.path) ?? str(request.outputPath) ?? str(data.savedAs),
    status,
    output,
  };
}

export function taskPanelStatus(task: ConversationTaskRecord): TaskPanelStatus {
  if (task.status === 'running') return 'running';
  const last = task.actions[task.actions.length - 1];
  if (last?.result?.ok === false && last.result.reason === 'requires-confirmation') return 'waiting';
  if (task.status === 'completed') return 'done';
  if (task.status === 'failed') return 'failed';
  return 'stopped';
}

/** Newest first, minus the ones the user removed. */
export function buildTaskPanelEntries(history: ConversationTaskRecord[] | undefined, removed: ReadonlySet<string>): TaskPanelEntry[] {
  return (history ?? [])
    .filter((task) => !removed.has(task.id))
    .map((task) => ({ id: task.id, goal: task.goal, status: taskPanelStatus(task), steps: task.actions.map(stepFor) }))
    .reverse();
}

export function countRunning(entries: TaskPanelEntry[]): number {
  return entries.filter((e) => e.status === 'running').length;
}
