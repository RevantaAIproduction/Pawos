import React, { useMemo, useState } from 'react';
import styles from './tasksPanel.module.css';
import type { TaskPanelEntry } from './tasksPanelModel';
import {
  STATUS_LABEL,
  TASK_CENTER_FILTERS,
  countByFilter,
  formatDuration,
  matchesFilter,
  type TaskCenterEntry,
  type TaskCenterFilter,
  type TaskCenterStatus,
} from './tasksCenterModel';

interface TasksPanelProps {
  /** Every task across chats (Work History + live state) — see tasksCenterModel.ts. */
  tasks: TaskCenterEntry[];
  loading?: boolean;
  error?: string | null;
  now: number;
  /** This chat's live task steps (terminal-style output), joined to `tasks` by task id. */
  steps: TaskPanelEntry[];
  /** The chat on screen, to label "This chat". */
  currentSessionId: string | null;
  focusTaskId?: string | null;
  onCancelActive: () => void;
  onOpenChat?: (sessionId: string) => void;
  /** Opens the task's file changes in the Worktree/Changes view; absent when no project is open. */
  onViewChanges?: (executionId: string) => void;
}

function StatusIcon({ status }: { status: TaskCenterStatus }) {
  if (status === 'running' || status === 'cancelling') return <span className={styles.spinner} aria-hidden="true" />;
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (status === 'completed') return <svg {...common}><path d="M3 8.5l3 3 7-7.5" /></svg>;
  if (status === 'failed') return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
  if (status === 'waiting') return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M6.5 5.5v5M9.5 5.5v5" /></svg>;
  if (status === 'interrupted') return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M8 4.8v3.6M8 10.8v.01" /></svg>;
  return <svg {...common} strokeDasharray="2.2 2.2"><circle cx="8" cy="8" r="6" /></svg>;
}

function ago(ms: number): string {
  if (ms < 45_000) return 'just now';
  return `${formatDuration(ms).split(' ')[0]} ago`;
}

const basename = (folder: string) => folder.split(/[\\/]/).filter(Boolean).pop() ?? folder;

/**
 * Right-side Tasks panel — the Tasks Center: every task across chats with its real state, filters,
 * and for each task its request, chat/project, timing, current step, file changes, tests and any
 * problem. This chat's tasks also show their steps like a terminal. Cancel reaches only the task
 * this window is running; closing the panel never cancels anything.
 */
export function TasksPanel({ tasks, loading, error, now, steps, currentSessionId, focusTaskId, onCancelActive, onOpenChat, onViewChanges }: TasksPanelProps) {
  const [filter, setFilter] = useState<TaskCenterFilter>('all');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const counts = useMemo(() => countByFilter(tasks), [tasks]);
  const visible = useMemo(() => tasks.filter((task) => matchesFilter(task, filter)), [tasks, filter]);
  const stepsByTaskId = useMemo(() => new Map(steps.map((entry) => [entry.id, entry])), [steps]);

  const toggle = (id: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={styles.root} data-testid="tasks-panel">
      <div className={styles.toolbar}>
        <span className={styles.heading}>Tasks</span>
        <span className={styles.count}>{counts.running > 0 ? `${counts.running} running` : 'Nothing running'}</span>
      </div>

      <div className={styles.filters} role="tablist" aria-label="Filter tasks">
        {TASK_CENTER_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            className={`${styles.filter} ${filter === option.id ? styles.filterActive : ''}`}
            onClick={() => setFilter(option.id)}
          >
            {option.label}
            {counts[option.id] > 0 && <span className={styles.filterCount}>{counts[option.id]}</span>}
          </button>
        ))}
      </div>

      {error && <div className={styles.notice} role="alert">{error}</div>}
      {loading && tasks.length === 0 && <div className={styles.empty}>Loading tasks…</div>}
      {!loading && visible.length === 0 && (
        <div className={styles.empty}>{filter === 'all' ? 'Tasks PawOS works on show up here, from every chat.' : 'No tasks in this view.'}</div>
      )}

      <ol className={styles.list}>
        {visible.map((task) => {
          const expanded = open.has(task.executionId) || (!!focusTaskId && task.taskRecordId === focusTaskId);
          const live = task.taskRecordId ? stepsByTaskId.get(task.taskRecordId) : undefined;
          const chatLabel = task.sessionId === null ? null : task.sessionId === currentSessionId ? 'This chat' : 'Another chat';
          const changeLine = task.changes && task.changes.files > 0 ? `${task.changes.files} file${task.changes.files === 1 ? '' : 's'} · +${task.changes.added} −${task.changes.removed}` : null;
          return (
            <li key={task.executionId} className={`${styles.item} ${styles[task.status] ?? ''}`} data-status={task.status}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => toggle(task.executionId)}
                  aria-expanded={expanded}
                  title={`${STATUS_LABEL[task.status]} · ${task.goal}`}
                >
                  <span className={styles.icon}>
                    <StatusIcon status={task.status} />
                  </span>
                  <span className={styles.rowText}>
                    <span className={styles.goal}>{task.goal}</span>
                    <span className={styles.meta}>
                      {STATUS_LABEL[task.status]}
                      {chatLabel && ` · ${chatLabel}`}
                      {task.projectFolder && ` · ${basename(task.projectFolder)}`}
                      {` · ${task.status === 'running' || task.status === 'cancelling' ? formatDuration(task.elapsedMs) : ago(now - task.lastActivityAt)}`}
                      {changeLine && ` · ${changeLine}`}
                    </span>
                    {task.health && task.health.state !== 'ok' && (
                      <span className={task.health.state === 'stalled' ? styles.healthWarn : styles.healthInfo}>{task.health.message}</span>
                    )}
                  </span>
                </button>
                {task.isActive && (task.status === 'running' || task.status === 'waiting') && (
                  <button type="button" className={styles.stop} onClick={onCancelActive} aria-label={`Cancel ${task.goal}`} title="Cancel task">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </div>

              {expanded && (
                <div className={styles.details}>
                  <dl className={styles.facts}>
                    <dt>Request</dt>
                    <dd className={styles.request}>{task.goal}</dd>
                    <dt>Status</dt>
                    <dd>{STATUS_LABEL[task.status]}{task.currentOperation ? ` — ${task.currentOperation}` : ''}</dd>
                    <dt>Started</dt>
                    <dd>{new Date(task.startedAt).toLocaleString()} · {task.endedAt ? `took ${formatDuration(task.elapsedMs)}` : `running ${formatDuration(task.elapsedMs)}`}</dd>
                    <dt>Last activity</dt>
                    <dd>{ago(now - task.lastActivityAt)}</dd>
                    {task.projectFolder && (
                      <>
                        <dt>Project</dt>
                        <dd title={task.projectFolder}>{task.projectFolder}</dd>
                      </>
                    )}
                    <dt>Changes</dt>
                    <dd>
                      {task.changes && task.changes.files > 0
                        ? `${task.changes.created} created · ${task.changes.modified} modified · ${task.changes.renamed} renamed · ${task.changes.deleted} deleted (+${task.changes.added} −${task.changes.removed})`
                        : task.changeHistory === 'unavailable'
                          ? 'This task changed files, but their history isn’t available (recorded before file tracking, or cleared).'
                          : 'No file changes recorded'}
                      {task.changes && task.changes.untrackedCommands > 0 && (
                        <span className={styles.muted}> — commands also ran; files they changed aren’t attributed to this task.</span>
                      )}
                    </dd>
                    <dt>Tests</dt>
                    <dd>
                      {task.tests
                        ? `${task.tests.passed} passed · ${task.tests.failed} failed${task.tests.skipped ? ` · ${task.tests.skipped} skipped` : ''}`
                        : 'No tests were run'}
                    </dd>
                    {task.problem && (
                      <>
                        <dt>Problem</dt>
                        <dd className={styles.problem}>{task.problem}</dd>
                      </>
                    )}
                    <dt className={styles.idLabel}>Task id</dt>
                    <dd className={styles.idValue}>{task.executionId}</dd>
                  </dl>

                  <div className={styles.actions}>
                    {task.sessionId && task.sessionId !== currentSessionId && onOpenChat && (
                      <button type="button" className={styles.action} onClick={() => onOpenChat(task.sessionId!)}>
                        Open chat
                      </button>
                    )}
                    {task.changes && task.changes.files > 0 && (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => onViewChanges?.(task.executionId)}
                        disabled={!onViewChanges}
                        title={onViewChanges ? 'Show this task’s file changes' : 'Open the task’s project to see its changes'}
                      >
                        View changes
                      </button>
                    )}
                    {task.isActive && (task.status === 'running' || task.status === 'waiting') && (
                      <button type="button" className={styles.action} onClick={onCancelActive}>
                        Cancel task
                      </button>
                    )}
                  </div>

                  {live && (
                    <div className={styles.terminal} aria-readonly="true">
                      {live.steps.length === 0 && <div className={styles.muted}>Starting…</div>}
                      {live.steps.map((step) => (
                        <div key={step.id} className={styles.step}>
                          <div className={styles.prompt}>
                            <span className={styles.path}>{step.path ? `${step.path}>` : '>'}</span> {step.commandLine}
                          </div>
                          {step.output && <pre className={`${styles.output} ${step.status === 'failed' ? styles.failedOutput : ''}`}>{step.output}</pre>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
