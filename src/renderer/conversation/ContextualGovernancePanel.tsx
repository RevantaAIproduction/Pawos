// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import styles from './contextualGovernancePanel.module.css';
import { ipc } from '../services/ipc/ipcBridgeImplementation';

interface PendingApproval {
  approvalId: string;
  actionType: string;
  requestedAt: number;
}

interface ContextualGovernancePanelProps {
  pendingApproval?: {
    approvalId: string;
    actionType: string;
    requestedAt: number;
  } | null;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}

export function ContextualGovernancePanel({ pendingApproval, onApprove, onDeny }: ContextualGovernancePanelProps) {
  const [approveRef, setApproveRef] = useState<HTMLButtonElement | null>(null);
  const [denyRef, setDenyRef] = useState<HTMLButtonElement | null>(null);
  const onApproveRef = useRef(onApprove);
  const onDenyRef = useRef(onDeny);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onApproveRef.current = onApprove;
    onDenyRef.current = onDeny;
  }, [onApprove, onDeny]);

  useEffect(() => {
    // Register listeners only once on mount
    const unsubscribeApproved = ipc.onGovernanceApproved(({ approvalId }) => {
      onApproveRef.current?.(approvalId);
    });

    const unsubscribeDenied = ipc.onGovernanceDenied(({ approvalId }) => {
      onDenyRef.current?.(approvalId);
    });

    return () => {
      unsubscribeApproved?.();
      unsubscribeDenied?.();
    };
  }, []); // Empty dependency - register once on mount only

  // Keyboard shortcuts: Alt+Enter = Allow Once, Alt+, = Allow Always, Esc = Deny
  useEffect(() => {
    if (!pendingApproval) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        approveRef?.click();
      } else if (e.altKey && e.key === ',') {
        e.preventDefault();
        // Find and click the "Allow Always" button
        const allowAlwaysBtn = document.querySelector('[title="Approve this action type always"]') as HTMLButtonElement;
        allowAlwaysBtn?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        denyRef?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingApproval, approveRef, denyRef]);

  // Show OS notification when approval is pending
  useEffect(() => {
    if (!pendingApproval) return;

    const notification = new Notification('PawOS Approval Needed', {
      body: `PawOS is waiting for your approval to ${pendingApproval.actionType.replace(/_/g, ' ').toLowerCase()}`,
      icon: undefined,
      tag: 'pawos-approval',
      requireInteraction: true,
    });

    return () => {
      notification.close();
    };
  }, [pendingApproval]);

  if (!pendingApproval) {
    return null;
  }

  const approval = pendingApproval;

  const handleAllowOnce = async () => {
    try {
      await ipc.governanceApprove(approval.approvalId);
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  };

  const handleAllowAlways = async () => {
    try {
      // Store approval for future similar actions
      await ipc.governanceApprove(approval.approvalId);
      // TODO: Store in preferences to auto-approve similar actions
    } catch (err) {
      console.error('Failed to approve always:', err);
    }
  };

  const handleDeny = async () => {
    try {
      await ipc.governanceDeny(approval.approvalId);
    } catch (err) {
      console.error('Failed to deny:', err);
    }
  };

  return (
    <div className={styles.panel} data-interactive="true">
      <div className={styles.content}>
        <div className={styles.header} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
          <div style={{ fontSize: '11px', color: 'rgba(var(--pawos-overlay-rgb), 0.5)', marginBottom: '4px' }}>
            PawOS needs your approval
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-overlay-rgb), 0.8)', fontWeight: 500 }}>
            {approval.actionType.replace(/_/g, ' ').charAt(0).toUpperCase() + approval.actionType.replace(/_/g, ' ').slice(1).toLowerCase()}
          </div>
        </div>
        <div className={styles.actions} style={{ display: 'flex', gap: '8px' }}>
          <button
            ref={setApproveRef}
            className={`${styles.button} ${styles.allow}`}
            onClick={handleAllowOnce}
            title="Alt+Enter to approve once"
            style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
          >
            Allow Once
          </button>
          <button
            className={`${styles.button} ${styles.allow}`}
            onClick={handleAllowAlways}
            title="Approve this action type always (Alt+,)"
            style={{ flex: 1, padding: '8px 12px', fontSize: '12px', opacity: 0.8 }}
          >
            Allow Always
            <span className={styles.shortcut} style={{ fontSize: '10px' }}>Alt+,</span>
          </button>
          <button
            ref={setDenyRef}
            className={`${styles.button} ${styles.deny}`}
            onClick={handleDeny}
            title="Esc to deny"
            style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
