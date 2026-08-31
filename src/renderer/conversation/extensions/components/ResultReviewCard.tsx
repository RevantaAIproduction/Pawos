import React, { useState, useRef, useEffect } from 'react';
import type { ResultReviewExtension } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface ResultReviewCardProps {
  extension: ResultReviewExtension;
  onAction?: (extensionId: string, action: string) => void;
}

/**
 * Result Review Card — Accept or request changes after successful execution
 */
export function ResultReviewCard({ extension, onAction }: ResultReviewCardProps) {
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const isActionable = extension.state === 'pending-review';

  // Keyboard event handler
  useEffect(() => {
    if (!isActionable || !cardRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this card is focused
      if (!cardRef.current?.contains(document.activeElement)) return;

      // ALT+ENTER activates focused button
      if ((e.altKey || e.metaKey) && e.key === 'Enter' && focusedAction) {
        e.preventDefault();
        handleAction(focusedAction);
      }

      // ESC cancels (do nothing for result review)
      if (e.key === 'Escape') {
        e.preventDefault();
        return;
      }

      // TAB/SHIFT+TAB navigate between actions
      if (e.key === 'Tab') {
        e.preventDefault();
        const actions = ['accept', 'needs-changes'];
        const currentIdx = focusedAction ? actions.indexOf(focusedAction) : -1;
        const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
        const wrapped = (nextIdx + actions.length) % actions.length;
        setFocusedAction(actions[wrapped] || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActionable, focusedAction]);

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
      case 'pending-review':
        return '✓';
      case 'accepted':
        return '✓';
      case 'needs-changes':
        return '🔄';
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
          <div className={styles.title}>Result Review</div>
          <div className={styles.description}>{extension.resultSummary}</div>

          {isActionable && (
            <div className={styles.actionGroup}>
              <button
                className={`${styles.actionButton} ${styles.success} ${focusedAction === 'accept' ? styles.focused : ''}`}
                onClick={() => handleAction('accept')}
                disabled={isLoading}
                onFocus={() => setFocusedAction('accept')}
                onBlur={() => setFocusedAction(null)}
              >
                Accept
              </button>
              <button
                className={`${styles.actionButton} ${styles.success} ${focusedAction === 'needs-changes' ? styles.focused : ''}`}
                onClick={() => handleAction('needs-changes')}
                disabled={isLoading}
                onFocus={() => setFocusedAction('needs-changes')}
                onBlur={() => setFocusedAction(null)}
              >
                Needs Changes
              </button>
            </div>
          )}

          {extension.state === 'accepted' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(100, 200, 100, 0.8)' }}>
              Result accepted. Proceeding to finalization...
            </div>
          )}

          {extension.state === 'needs-changes' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(255, 165, 0, 0.8)' }}>
              Waiting for revision...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
