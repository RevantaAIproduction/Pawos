import React from 'react';
import type { TaskProgressExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface TaskProgressExtensionCardProps {
  extension: TaskProgressExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/** "1 running task" / "2 running tasks" — steps of this task that haven't finished yet. */
export function runningTaskLabel(extension: Pick<TaskProgressExtension, 'state' | 'actions'>): string {
  const running = (extension.actions ?? []).filter((a) => a.status === 'pending' || a.status === 'running').length;
  const isRunning = extension.state === 'running' || extension.state === 'progress' || extension.state === 'queued';
  if (!isRunning) {
    if (extension.state === 'completed') return 'Task finished';
    if (extension.state === 'failed') return 'Task failed';
    return 'Task stopped';
  }
  const count = Math.max(1, running);
  return `${count} running task${count === 1 ? '' : 's'}`;
}

/**
 * The task's inline chat card — only the running count. Everything else (path, command, live
 * output, Stop / Remove all) lives in the right-side Tasks panel this opens.
 */
export function TaskProgressExtensionCard({ extension, onExpand }: TaskProgressExtensionCardProps) {
  const isRunning = extension.state === 'running' || extension.state === 'progress' || extension.state === 'queued';
  return (
    <button
      type="button"
      className={styles.runningTaskPill}
      title="Show running tasks"
      onClick={() =>
        onExpand?.({
          extensionId: extension.id,
          extensionType: 'task-progress',
          target: 'tasks',
          payload: { taskId: extension.taskId },
        })
      }
    >
      <span className={isRunning ? styles.runningTaskSpinner : styles.runningTaskDot} aria-hidden="true" />
      {runningTaskLabel(extension)}
      <span className={styles.runningTaskChevron} aria-hidden="true">›</span>
    </button>
  );
}
