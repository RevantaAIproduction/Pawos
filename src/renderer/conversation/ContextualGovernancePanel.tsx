// @ts-nocheck
import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const unsubscribeApproved = ipc.onGovernanceApproved(({ approvalId }) => {
      onApprove?.(approvalId);
    });

    const unsubscribeDenied = ipc.onGovernanceDenied(({ approvalId }) => {
      onDeny?.(approvalId);
    });

    return () => {
      unsubscribeApproved?.();
      unsubscribeDenied?.();
    };
  }, [onApprove, onDeny]);

  // Keyboard shortcuts: Alt+Enter = Allow, Esc = Deny
  useEffect(() => {
    if (!pendingApproval) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        approveRef?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        denyRef?.click();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingApproval, approveRef, denyRef]);

  if (!pendingApproval) {
    return null;
  }

  const approval = pendingApproval;

  const handleApprove = async () => {
    try {
      await ipc.governanceApprove(approval.approvalId);
    } catch (err) {
      console.error('Failed to approve:', err);
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
        <div className={styles.message}>
          PawOS wants to {approval.actionType.replace(/_/g, ' ').toLowerCase()}
        </div>
        <div className={styles.actions}>
          <button
            ref={setApproveRef}
            className={`${styles.button} ${styles.allow}`}
            onClick={handleApprove}
            title="Alt+Enter to approve"
          >
            Allow
            <span className={styles.shortcut}>Alt+Enter</span>
          </button>
          <button
            ref={setDenyRef}
            className={`${styles.button} ${styles.deny}`}
            onClick={handleDeny}
            title="Esc to deny"
          >
            Deny
            <span className={styles.shortcut}>Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
