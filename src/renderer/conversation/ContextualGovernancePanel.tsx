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
    details?: string;
  } | null;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}

export function ContextualGovernancePanel({ pendingApproval, onApprove, onDeny }: ContextualGovernancePanelProps) {
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

  // Show OS notification when approval is pending
  useEffect(() => {
    if (!pendingApproval) return;

    try {
      // Try using Electron's native notification via IPC if available
      if (ipc.companionShowNotification) {
        ipc.companionShowNotification(
          'PawOS Approval Needed',
          `PawOS is waiting for your approval to ${pendingApproval.actionType.replace(/_/g, ' ').toLowerCase()}`
        );
      } else {
        // Fallback to Web Notification API
        new Notification('PawOS Approval Needed', {
          body: `PawOS is waiting for your approval to ${pendingApproval.actionType.replace(/_/g, ' ').toLowerCase()}`,
          icon: undefined,
          tag: 'pawos-approval',
          requireInteraction: true,
        });
      }
    } catch (err) {
      console.error('Failed to show notification:', err);
    }
  }, [pendingApproval]);

  if (!pendingApproval) {
    return null;
  }

  const approval = pendingApproval;
  const hasDetails = approval.details && approval.details.trim().length > 0;

  // Format action type with context for all governance types
  const getActionLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      'run_command': 'Running command',
      'write_file': 'Writing file',
      'create_folder': 'Creating folder',
      'delete_path': 'Deleting',
      'install_tool': 'Installing software',
      'download_software': 'Downloading software',
      'set_path_entry': 'Adding to PATH',
      'connect_database': 'Connecting to database',
      'request_api_access': 'Requesting API access',
      'propose_code_edit_plan': 'Proposing code changes',
      'deploy_project': 'Deploying project',
      'git_commit': 'Creating git commit',
    };
    return typeMap[type] || type.replace(/_/g, ' ');
  };

  return (
    <div className={styles.panel} data-interactive="true">
      <div className={styles.content}>
        <div style={{ padding: '12px', backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.05)', borderRadius: '6px', borderLeft: '3px solid rgba(59, 130, 246, 0.5)' }}>
          <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-overlay-rgb), 0.9)', marginBottom: '8px', fontWeight: 500 }}>
            {getActionLabel(approval.actionType)}
          </div>

          {hasDetails && (
            <div style={{
              fontSize: '11px',
              color: 'rgba(var(--pawos-overlay-rgb), 0.7)',
              backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.08)',
              padding: '8px',
              borderRadius: '4px',
              marginBottom: '8px',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              maxHeight: '120px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {approval.details}
            </div>
          )}

          <div style={{ fontSize: '11px', color: 'rgba(var(--pawos-overlay-rgb), 0.6)' }}>
            Type or say <strong style={{ color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>allow</strong> to proceed, or <strong style={{ color: 'rgba(var(--pawos-overlay-rgb), 0.8)' }}>deny</strong> to skip.
          </div>
        </div>
      </div>
    </div>
  );
}
