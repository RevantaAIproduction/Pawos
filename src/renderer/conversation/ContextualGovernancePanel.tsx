import React, { useEffect, useState } from 'react';
import styles from './contextualGovernancePanel.module.css';
import { ipc } from '../services/ipc/ipcBridgeImplementation';

interface PendingApproval {
  approvalId: string;
  actionType: string;
  requestedAt: number;
}

interface ContextualGovernancePanelProps {
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}

export function ContextualGovernancePanel({ onApprove, onDeny }: ContextualGovernancePanelProps) {
  const [pending, setPending] = useState<PendingApproval[]>([]);

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const result = await ipc.governanceGetPending();
        setPending(result);
      } catch (err) {
        // Silently ignore if governance not available
      }
    };

    fetchPending();

    const unsubscribeApproved = ipc.onGovernanceApproved(({ approvalId }) => {
      setPending((prev) => prev.filter((p) => p.approvalId !== approvalId));
      onApprove?.(approvalId);
    });

    const unsubscribeDenied = ipc.onGovernanceDenied(({ approvalId }) => {
      setPending((prev) => prev.filter((p) => p.approvalId !== approvalId));
      onDeny?.(approvalId);
    });

    return () => {
      unsubscribeApproved?.();
      unsubscribeDenied?.();
    };
  }, [onApprove, onDeny]);

  if (!pending.length) {
    return null;
  }

  const approval = pending[0];

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
          <button className={`${styles.button} ${styles.allow}`} onClick={handleApprove}>
            Allow
            <span className={styles.shortcut}>Alt+Enter</span>
          </button>
          <button className={`${styles.button} ${styles.deny}`} onClick={handleDeny}>
            Deny
            <span className={styles.shortcut}>Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
