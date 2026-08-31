import React, { useMemo } from 'react';
import type { ConversationTaskAction } from '../ConversationTypes';
import styles from './liveWorkStream.module.css';

interface LiveWorkStreamProps {
  /** Recent actions from the current task — only show while task is running */
  actions: ConversationTaskAction[];
  isRunning: boolean;
  showActivityDot?: boolean;
}

/**
 * Ephemeral live work stream — shows what PawOS is currently doing in real-time.
 * Remains visible while task is active (planning, executing, waiting for permission).
 * Disappears only when task reaches terminal state (completed/failed/interrupted).
 * When waiting for permission/approval, the stream pauses but remains visible.
 *
 * Uses muted developer-style appearance and only shows safe operational activity:
 * Reading files, Searching, Found results, Checking state, Editing, Running, etc.
 * Does NOT expose hidden reasoning or chain-of-thought.
 */
export function LiveWorkStream({ actions, isRunning, showActivityDot = true }: LiveWorkStreamProps) {
  // Always render if we have actions (even if paused waiting for permission)
  // Stream only disappears when task reaches terminal state (handled by parent component)

  // Get the last 10 actions to display (newest first in reverse order for display)
  const recentActions = useMemo(() => {
    if (!actions || actions.length === 0) return [];
    return [...actions].slice(-10).reverse();
  }, [actions]);

  // Current action is the last one in the original array (most recent)
  const currentAction = actions?.[actions.length - 1] || null;

  if (!recentActions.length && !currentAction) {
    return null;
  }

  return (
    <div className={styles.container}>
      <div className={styles.streamContent}>
        {/* Current activity indicator */}
        {currentAction && (
          <div className={styles.currentActivity}>
            {showActivityDot && (
              <div className={styles.activityDot}>
                <div className={styles.pulse} />
              </div>
            )}
            <div className={styles.currentText}>
              {currentAction.inProgressText}
            </div>
          </div>
        )}

        {/* Recent activity stream (max 8 visible items) */}
        {recentActions.length > 0 && (
          <div className={styles.recentStream}>
            {recentActions.slice(0, 8).map((action, idx) => (
              <div
                key={action.id}
                className={`${styles.streamItem} ${
                  action.result ? styles.completed : styles.running
                }`}
                style={{ opacity: 1 - idx * 0.08 }} // Fade out older items
              >
                <div className={styles.itemDot}>
                  {action.result ? '✓' : '•'}
                </div>
                <div className={styles.itemText}>
                  {action.result ? action.doneText || action.inProgressText : action.inProgressText}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
