import type { CodeChangeSummary } from '../../shared/actions/CodeChangeTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

/**
 * The Tasks Center: one row per execution (one user request), across every chat — built only from
 * persisted Work History records (ExecutionRecord), their change ledgers, and the window's live
 * task. No second task database. Every status, time, count and warning shown comes from a recorded
 * fact; nothing is estimated, and inactivity alone never turns into "failed".
 */

export type TaskCenterStatus =
  | 'running'
  | 'waiting'
  | 'cancelling'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'stopped';

export type TaskCenterFilter = 'all' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted';

export const TASK_CENTER_FILTERS: { id: TaskCenterFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed / cancelled' },
  { id: 'interrupted', label: 'Interrupted' },
];

export const STATUS_LABEL: Record<TaskCenterStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for approval',
  cancelling: 'Cancelling…',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
  stopped: 'Stopped',
};

export type TaskHealth = { state: 'ok' | 'long_running' | 'stalled'; message: string };

export type TaskCenterEntry = {
  executionId: string;
  goal: string;
  status: TaskCenterStatus;
  sessionId: string | null;
  projectFolder: string | null;
  taskRecordId: string | null;
  startedAt: number;
  endedAt: number | null;
  elapsedMs: number;
  lastActivityAt: number;
  currentOperation: string | null;
  changes: { files: number; added: number; removed: number; created: number; modified: number; deleted: number; renamed: number; untrackedCommands: number } | null;
  /**
   * 'recorded': this task's file history exists. 'unavailable': Work History shows it changed files,
   * but no file history exists for it (recorded before file tracking, or cleared by retention).
   * 'none': no file changes are known.
   */
  changeHistory: 'recorded' | 'unavailable' | 'none';
  tests: { passed: number; failed: number; skipped: number; lastSummary: string | null } | null;
  /** The recorded reason it stopped or failed, if any. */
  problem: string | null;
  health: TaskHealth | null;
  /** True only for the task this window is running now (the one a Cancel can reach). */
  isActive: boolean;
};

/**
 * Time limits the runtime itself enforces per step (RunCommandPlugin 45 s, BuildProjectPlugin 5 min,
 * the validation pipeline's commands) — a step inside its own limit is "running long", never stalled.
 */
export const STEP_TIME_LIMITS_MS: Record<string, number> = {
  runCommand: 45_000,
  buildProject: 5 * 60_000,
  runValidationPipeline: 10 * 60_000,
  installTool: 10 * 60_000,
  downloadSoftware: 10 * 60_000,
  updateSoftware: 10 * 60_000,
};
/** A step with no known limit, or the model between steps: this long without any activity is worth a warning. */
export const INACTIVITY_WARNING_MS = 2 * 60_000;
/** Extra time allowed past a step's own limit before it is called stalled (the limit's result is on its way). */
const LIMIT_GRACE_MS = 30_000;
/** Cancelling for this long without confirmation is worth a warning. */
const CANCEL_WARNING_MS = 60_000;

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function statusOf(record: ExecutionRecord): TaskCenterStatus {
  switch (record.status) {
    case 'in_progress':
      return 'running';
    case 'awaiting_approval':
      return 'waiting';
    case 'cancelling':
      return 'cancelling';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'stopped';
  }
}

/**
 * Health from real timestamps only. Running a step within its own time limit → "running long"
 * (normal). Past the limit plus a grace period, or no activity at all for a while with no step
 * running → "stalled" (a warning — never converted to failed). Cancelling for a long time → warning.
 */
export function healthOf(record: ExecutionRecord, now: number): TaskHealth | null {
  if (record.status === 'cancelling') {
    const since = record.cancellation?.requestedAt ?? record.lastActivityAt ?? record.startedAt;
    if (now - since < CANCEL_WARNING_MS) return null;
    const what = record.cancellation?.stillRunningAction ?? record.currentOperation?.actionType ?? 'the running step';
    return { state: 'stalled', message: `Still waiting for ${what} to stop (${formatDuration(now - since)}).` };
  }
  if (record.status !== 'in_progress') return null;
  const op = record.currentOperation;
  if (op) {
    const running = now - op.startedAt;
    const limit = STEP_TIME_LIMITS_MS[op.actionType];
    if (limit !== undefined) {
      if (running <= limit + LIMIT_GRACE_MS) {
        return running > INACTIVITY_WARNING_MS / 4
          ? { state: 'long_running', message: `${op.label} — running ${formatDuration(running)} (its limit is ${formatDuration(limit)}).` }
          : { state: 'ok', message: op.label };
      }
      return { state: 'stalled', message: `${op.label} has run ${formatDuration(running)}, past its ${formatDuration(limit)} limit, with no result yet.` };
    }
    const quiet = now - (record.lastActivityAt ?? op.startedAt);
    return quiet > INACTIVITY_WARNING_MS
      ? { state: 'stalled', message: `No activity for ${formatDuration(quiet)} while ${op.label.replace(/…$/, '')}.` }
      : { state: 'ok', message: op.label };
  }
  const quiet = now - (record.lastActivityAt ?? record.startedAt);
  return quiet > INACTIVITY_WARNING_MS
    ? { state: 'stalled', message: `No activity for ${formatDuration(quiet)} (waiting on the model's next step).` }
    : null;
}

function testsOf(record: ExecutionRecord): TaskCenterEntry['tests'] {
  const tests = (record.verificationEvidence ?? []).filter((v) => v.type === 'TEST');
  if (tests.length === 0) return null;
  return {
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped' || t.status === 'not_performed').length,
    lastSummary: tests[tests.length - 1]?.failureReason ?? tests[tests.length - 1]?.summary ?? null,
  };
}

function problemOf(record: ExecutionRecord): string | null {
  if (record.status === 'completed' || record.status === 'in_progress') return null;
  if (record.stoppedReason) return record.stoppedReason;
  if (record.status === 'failed') {
    const failedStep = [...record.timeline].reverse().find((t) => !t.ok);
    return failedStep ? failedStep.label : 'A step failed.';
  }
  return null;
}

export function buildTaskCenterEntries(
  records: ExecutionRecord[],
  changes: ReadonlyMap<string, CodeChangeSummary>,
  activeExecutionId: string | null,
  now: number
): TaskCenterEntry[] {
  const seen = new Set<string>();
  const entries: TaskCenterEntry[] = [];
  for (const record of [...records].sort((a, b) => b.startedAt - a.startedAt)) {
    if (seen.has(record.id)) continue; // one canonical row per execution
    seen.add(record.id);
    const change = changes.get(record.id);
    const status = statusOf(record);
    const endedAt = status === 'running' || status === 'waiting' || status === 'cancelling' ? null : record.completedAt ?? record.lastActivityAt ?? null;
    entries.push({
      executionId: record.id,
      goal: record.goal,
      status,
      sessionId: record.sessionId ?? null,
      projectFolder: record.projectFolder ?? null,
      taskRecordId: record.taskRecordId ?? null,
      startedAt: record.startedAt,
      endedAt,
      elapsedMs: (endedAt ?? now) - record.startedAt,
      lastActivityAt: record.lastActivityAt ?? record.completedAt ?? record.startedAt,
      currentOperation: status === 'running' || status === 'cancelling' ? record.currentOperation?.label ?? null : null,
      changes: change
        ? { ...change.totals, untrackedCommands: change.untrackedCommandCount }
        : null,
      changeHistory: change ? 'recorded' : (record.fileEvidence ?? []).some((e) => e.result === 'completed') ? 'unavailable' : 'none',
      tests: testsOf(record),
      problem: problemOf(record),
      health: healthOf(record, now),
      isActive: record.id === activeExecutionId && (status === 'running' || status === 'cancelling' || status === 'waiting'),
    });
  }
  return entries;
}

export function matchesFilter(entry: TaskCenterEntry, filter: TaskCenterFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'running':
      return entry.status === 'running' || entry.status === 'cancelling';
    case 'waiting':
      return entry.status === 'waiting';
    case 'completed':
      return entry.status === 'completed';
    case 'failed':
      return entry.status === 'failed' || entry.status === 'cancelled' || entry.status === 'stopped';
    case 'interrupted':
      return entry.status === 'interrupted';
  }
}

export function countByFilter(entries: TaskCenterEntry[]): Record<TaskCenterFilter, number> {
  const counts = { all: 0, running: 0, waiting: 0, completed: 0, failed: 0, interrupted: 0 } as Record<TaskCenterFilter, number>;
  for (const filter of Object.keys(counts) as TaskCenterFilter[]) counts[filter] = entries.filter((e) => matchesFilter(e, filter)).length;
  return counts;
}
