import React from 'react';
import type { TaskProgressExtension, ExtensionExpandRequest } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface TaskProgressExtensionCardProps {
  extension: TaskProgressExtension;
  onExpand?: (request: ExtensionExpandRequest) => void;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Task/agent execution progress — inline progress card with expand
 * Updates in real-time as task progresses through states
 */
export function TaskProgressExtensionCard({
  extension,
  onExpand,
  onAction,
}: TaskProgressExtensionCardProps) {
  const getStatusIcon = () => {
    switch (extension.state) {
      case 'queued':
        return '⏱️';
      case 'running':
        return '⚙️';
      case 'progress':
        return '⚡';
      case 'waiting-permission':
        return '⏳';
      case 'completed':
        return '✓';
      case 'failed':
        return '⚠️';
      case 'stopped':
        return '⏸️';
      default:
        return '?';
    }
  };

  const isRunning = extension.state === 'running' || extension.state === 'progress';

  return (
    <div className={styles.extensionCard}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>{extension.goal}</div>
          {extension.currentAction && (
            <div className={styles.description}>{extension.currentAction}</div>
          )}
          {extension.status && (
            <div className={styles.description}>{extension.status}</div>
          )}
          {typeof extension.progress === 'number' && isRunning && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, Math.max(0, extension.progress))}%` }}
                />
              </div>
              <div className={styles.progressLabel}>{Math.round(extension.progress)}% complete</div>
            </>
          )}
          {extension.actions && extension.actions.length > 0 && (
            <div className={styles.stepsList}>
              {extension.actions.slice(0, 3).map((action) => (
                <div key={action.id} className={styles.stepItem}>
                  <div className={styles.stepProgress}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                      {action.inProgressText}
                    </div>
                    {action.status === 'running' && (
                      <div className={styles.stepProgressBar}>
                        <div className={styles.stepProgressFill} style={{ width: '50%' }} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {extension.actions.length > 3 && (
                <div className={styles.description}>+{extension.actions.length - 3} more steps</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.extensionCardControls}>
        {extension.expandTarget && (
          <button
            className={styles.expandButton}
            title="Expand to full view"
            onClick={() =>
              onExpand?.({
                extensionId: extension.id,
                extensionType: 'task-progress',
                target: extension.expandTarget as 'browser' | 'terminal' | 'worktree',
                payload: {
                  taskId: extension.taskId,
                },
              })
            }
          >
            ↗
          </button>
        )}
      </div>
    </div>
  );
}
