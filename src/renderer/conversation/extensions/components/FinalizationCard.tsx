import React, { useState, useRef, useEffect } from 'react';
import type { FinalizationExtension } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface FinalizationCardProps {
  extension: FinalizationExtension;
  onAction?: (extensionId: string, action: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  save: 'Save Locally',
  commit: 'Commit to Git',
  push: 'Push to Git',
  deploy: 'Deploy',
  comment: 'Comment on Ticket',
  done: 'Done',
};

/**
 * Finalization Card — Save, Commit, Push, Deploy, Comment, Done
 * Only shows actions supported by current context
 */
export function FinalizationCard({ extension, onAction }: FinalizationCardProps) {
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isActionable = extension.state === 'waiting-action';

  // Keyboard event handler
  useEffect(() => {
    if (!isActionable || !cardRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!cardRef.current?.contains(document.activeElement)) return;

      // ALT+ENTER activates focused button
      if ((e.altKey || e.metaKey) && e.key === 'Enter' && focusedAction) {
        e.preventDefault();
        handleAction(focusedAction);
      }

      // TAB/SHIFT+TAB navigate
      if (e.key === 'Tab') {
        e.preventDefault();
        const actions = extension.availableActions;
        const currentIdx = focusedAction ? actions.indexOf(focusedAction as any) : -1;
        const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
        const wrapped = (nextIdx + actions.length) % actions.length;
        setFocusedAction(actions[wrapped] || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActionable, focusedAction, extension.availableActions]);

  const handleAction = async (action: string) => {
    setIsLoading(true);
    try {
      await onAction?.(extension.id, action);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (extension.state) {
      case 'waiting-action':
        return '→';
      case 'executing':
        return '⚙️';
      case 'completed':
        return '✓';
      case 'failed':
        return '✕';
      default:
        return '?';
    }
  };

  return (
    <div className={styles.extensionCard} ref={cardRef}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>Finalization</div>
          <div className={styles.description}>Choose next step</div>

          {isActionable && extension.availableActions.length > 0 && (
            <div className={styles.actionGroup}>
              {extension.availableActions.map((action) => (
                <button
                  key={action}
                  className={`${styles.actionButton} ${styles.success} ${focusedAction === action ? styles.focused : ''}`}
                  onClick={() => handleAction(action)}
                  disabled={isLoading}
                  onFocus={() => setFocusedAction(action)}
                  onBlur={() => setFocusedAction(null)}
                >
                  {ACTION_LABELS[action] || action}
                </button>
              ))}
            </div>
          )}

          {extension.state === 'executing' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(100, 150, 255, 0.8)' }}>
              Executing action...
            </div>
          )}

          {extension.state === 'completed' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(100, 200, 100, 0.8)' }}>
              Completed successfully.
            </div>
          )}

          {extension.state === 'failed' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(255, 100, 100, 0.8)' }}>
              Action failed. Please try again.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
