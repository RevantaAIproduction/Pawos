import React, { useState } from 'react';
import styles from './tasksPanel.module.css';
import { countRunning, type TaskPanelEntry, type TaskPanelStatus } from './tasksPanelModel';

const STATUS_LABEL: Record<TaskPanelStatus, string> = {
  running: 'Running',
  waiting: 'Waiting for "allow"',
  done: 'Done',
  failed: 'Failed',
  stopped: 'Stopped',
};

interface TasksPanelProps {
  entries: TaskPanelEntry[];
  focusTaskId?: string | null;
  onStopTask: (entry: TaskPanelEntry) => void;
  onRemoveAll: () => void;
}

function StatusIcon({ status }: { status: TaskPanelStatus }) {
  if (status === 'running') return <span className={styles.spinner} aria-hidden="true" />;
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (status === 'done') return <svg {...common}><path d="M3 8.5l3 3 7-7.5" /></svg>;
  if (status === 'failed') return <svg {...common}><path d="M4 4l8 8M12 4l-8 8" /></svg>;
  if (status === 'waiting') return <svg {...common}><circle cx="8" cy="8" r="6" /><path d="M6.5 5.5v5M9.5 5.5v5" /></svg>;
  return <svg {...common} strokeDasharray="2.2 2.2"><circle cx="8" cy="8" r="6" /></svg>;
}

/**
 * Right-side Tasks panel — the conversation's tasks as a checklist, oldest first: finished ones
 * ticked and struck through, the running one with a spinner. A task opens to show the folder and
 * command each step ran, with its output, like a terminal. Controls: Stop (running task) and Clear.
 */
export function TasksPanel({ entries, focusTaskId, onStopTask, onRemoveAll }: TasksPanelProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(focusTaskId ? [focusTaskId] : []));
  const ordered = [...entries].reverse();
  const running = countRunning(entries);
  const done = entries.filter((entry) => entry.status === 'done').length;

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
        <span className={styles.count}>
          {running > 0 ? `${running} running` : 'Nothing running'}
          {done > 0 ? ` · ${done} done` : ''}
        </span>
        <button type="button" className={styles.clear} onClick={onRemoveAll} disabled={entries.length === 0}>
          Clear
        </button>
      </div>

      {entries.length === 0 && <div className={styles.empty}>Tasks PawOS works on in this chat show up here.</div>}

      <ol className={styles.list}>
        {ordered.map((entry) => {
          const expanded = open.has(entry.id) || entry.id === focusTaskId;
          const active = entry.status === 'running' || entry.status === 'waiting';
          return (
            <li key={entry.id} className={`${styles.item} ${styles[entry.status]}`} data-status={entry.status}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={() => toggle(entry.id)}
                  aria-expanded={expanded}
                  title={`${STATUS_LABEL[entry.status]} · ${entry.goal}`}
                >
                  <span className={styles.icon}>
                    <StatusIcon status={entry.status} />
                  </span>
                  <span className={styles.goal}>{entry.goal}</span>
                  <span className={styles.srOnly}> ({STATUS_LABEL[entry.status]})</span>
                </button>
                {active && (
                  <button type="button" className={styles.stop} onClick={() => onStopTask(entry)} aria-label={`Stop ${entry.goal}`} title="Stop task">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <rect x="1" y="1" width="8" height="8" rx="1.5" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </div>
              {expanded && (
                <div className={styles.terminal} aria-readonly="true">
                  {entry.steps.length === 0 && <div className={styles.muted}>Starting…</div>}
                  {entry.steps.map((step) => (
                    <div key={step.id} className={styles.step}>
                      <div className={styles.prompt}>
                        <span className={styles.path}>{step.path ? `${step.path}>` : '>'}</span> {step.commandLine}
                      </div>
                      {step.output && <pre className={`${styles.output} ${step.status === 'failed' ? styles.failedOutput : ''}`}>{step.output}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
