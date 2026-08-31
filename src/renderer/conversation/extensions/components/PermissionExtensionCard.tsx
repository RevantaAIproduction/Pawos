import React, { useState, useRef, useEffect } from 'react';
import type { PermissionExtension } from '../ExtensionTypes';
import styles from '../extensions.module.css';

interface PermissionExtensionCardProps {
  extension: PermissionExtension;
  onAction?: (extensionId: string, action: string, payload?: Record<string, unknown>) => void;
}

/**
 * Derive a human-readable action label from action type
 */
function getActionLabel(actionType: string): string {
  const actionMap: Record<string, string> = {
    'read': 'Read',
    'edit': 'Edit',
    'write': 'Write',
    'delete': 'Delete',
    'run': 'Run',
    'execute': 'Execute',
    'test': 'Test',
    'install': 'Install',
    'uninstall': 'Uninstall',
    'update': 'Update',
    'configure': 'Configure',
    'commit': 'Commit',
    'push': 'Push',
    'deploy': 'Deploy',
    'comment': 'Comment',
    'audit': 'Audit',
    'access': 'Access',
    'inspect': 'Inspect',
  };

  return actionMap[actionType.toLowerCase()] || actionType.charAt(0).toUpperCase() + actionType.slice(1);
}

/**
 * Permission request extension — inline actionable card
 * Transitions from pending → approved/denied → executing → completed/failed
 */
export function PermissionExtensionCard({ extension, onAction }: PermissionExtensionCardProps) {
  const [focusedAction, setFocusedAction] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const getStatusIcon = () => {
    switch (extension.state) {
      case 'pending':
        return '⏳';
      case 'approved':
        return '✓';
      case 'denied':
        return '✕';
      case 'executing':
        return '⚙️';
      case 'completed':
        return '✓';
      case 'failed':
        return '⚠️';
      default:
        return '?';
    }
  };

  const isActionable = extension.state === 'pending';

  const actionLabel = getActionLabel(extension.title?.split(' ')[1]?.toLowerCase() || 'action');

  // Keyboard event handler
  useEffect(() => {
    if (!isActionable || !cardRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this card is focused or contains focus
      if (!cardRef.current?.contains(document.activeElement)) return;

      // ALT+ENTER activates focused button
      if ((e.altKey || e.metaKey) && e.key === 'Enter' && focusedAction) {
        e.preventDefault();
        handleAction(focusedAction);
      }

      // ESC cancels
      if (e.key === 'Escape') {
        e.preventDefault();
        handleAction('deny');
      }

      // TAB/SHIFT+TAB navigate between actions
      if (e.key === 'Tab') {
        e.preventDefault();
        const actions = extension.allowedActions || [];
        const currentIdx = focusedAction ? actions.indexOf(focusedAction as any) : -1;
        const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
        const wrapped = (nextIdx + actions.length) % actions.length;
        setFocusedAction(actions[wrapped] || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActionable, focusedAction, extension.allowedActions]);

  const handleAction = async (action: string) => {
    setIsLoading(true);
    try {
      await onAction?.(extension.id, action, {
        actionId: extension.actionId,
        taskId: extension.taskId,
        approvalId: extension.approvalId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.extensionCard} ref={cardRef}>
      <div className={styles.extensionCardHeader}>
        <div className={`${styles.statusIcon} ${styles[extension.state]}`}>
          {getStatusIcon()}
        </div>
        <div className={styles.extensionCardContent}>
          <div className={styles.title}>PawOS needs permission</div>
          <div className={styles.description}>{extension.title}</div>
          {extension.description && (
            <div className={styles.description} style={{ marginTop: 4 }}>
              {extension.description}
            </div>
          )}
          {extension.requiredScopes && extension.requiredScopes.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {extension.requiredScopes.map((scope, i) => (
                <div key={i} className={styles.permissionScope}>
                  {scope}
                </div>
              ))}
            </div>
          )}
          {isActionable && extension.allowedActions && extension.allowedActions.length > 0 && (
            <div className={styles.actionGroup}>
              {extension.allowedActions.map((action) => (
                <button
                  key={action}
                  className={`${styles.actionButton} ${
                    action === 'deny' ? styles.danger : styles.success
                  } ${focusedAction === action ? styles.focused : ''}`}
                  onClick={() => handleAction(action)}
                  disabled={isLoading}
                  onFocus={() => setFocusedAction(action)}
                  onBlur={() => setFocusedAction(null)}
                >
                  {action === 'allow-once'
                    ? `Allow me to ${actionLabel}`
                    : action === 'allow-always'
                      ? `Always Allow me to ${actionLabel}`
                      : 'Deny'}
                </button>
              ))}
            </div>
          )}
          {extension.state === 'approved' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(100, 200, 100, 0.8)' }}>
              Permission approved. Executing...
            </div>
          )}
          {extension.state === 'denied' && (
            <div className={styles.description} style={{ marginTop: 4, color: 'rgba(255, 100, 100, 0.8)' }}>
              Permission denied.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
