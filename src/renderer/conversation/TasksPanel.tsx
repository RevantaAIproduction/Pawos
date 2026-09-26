import React from 'react';
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

/**
 * Right-side Tasks panel — view only. Each task shows the folder and command it ran with its
 * status and output like a terminal; the only controls are Stop task and Remove all tasks.
 */
export function TasksPanel({ entries, focusTaskId, onStopTask, onRemoveAll }: TasksPanelProps) {
  const running = countRunning(entries);
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {running} running task{running === 1 ? '' : 's'}
        </span>
        <button type="button" className={styles.removeAll} onClick={onRemoveAll} disabled={entries.length === 0}>
          Remove all tasks
        </button>
      </div>

      {entries.length === 0 && <div className={styles.empty}>No tasks.</div>}

      {entries.map((entry) => (
        <section key={entry.id} className={`${styles.task} ${entry.id === focusTaskId ? styles.focused : ''}`}>
          <div className={styles.taskHeader}>
            <span className={`${styles.badge} ${styles[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>
            <span className={styles.goal} title={entry.goal}>{entry.goal}</span>
            {(entry.status === 'running' || entry.status === 'waiting') && (
              <button type="button" className={styles.stop} onClick={() => onStopTask(entry)}>
                Stop task
              </button>
            )}
          </div>
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
        </section>
      ))}
    </div>
  );
}
