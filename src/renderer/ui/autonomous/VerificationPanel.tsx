/**
 * Verification panel for autonomous ticket work.
 * Shows pending verification queue and allows approve/reject decisions.
 */

import React, { useState, useEffect } from 'react';
import { getIpcBridge } from '../../services/ipc/ipcBridge';

export interface AutonomousRunVerification {
  runId: string;
  ticketId: string | null;
  ticketSource: string;
  status: 'awaiting_verification' | 'verified' | 'failed';
  executionSummary: string;
  filesChanged: number;
  validationPassed: boolean;
  prUrl?: string;
  createdAt: string;
  implementationCompleteAt: string;
  externalUpdateStatus?: string;
}

interface VerificationPanelProps {
  pending: AutonomousRunVerification[];
  onVerified?: (runId: string) => void;
  onRejected?: (runId: string) => void;
}

export function VerificationPanel({ pending, onVerified, onRejected }: VerificationPanelProps) {
  const [verifying, setVerifying] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());

  const handleApprove = async (run: AutonomousRunVerification) => {
    setVerifying((prev) => new Set([...prev, run.runId]));
    setErrors((prev) => new Map(prev) as any); // Clear any error

    try {
      const result = await getIpcBridge().autonomousVerifyRun({
        runId: run.runId,
        approved: true,
        verifierNotes: 'Approved via verification panel',
      });

      if (!result.ok) {
        throw new Error(result.reason || 'Verification failed');
      }

      onVerified?.(run.runId);
    } catch (error) {
      setErrors(
        (prev) =>
          new Map(prev) as any // Type safety workaround
      );
      const errMap = new Map(errors);
      errMap.set(run.runId, error instanceof Error ? error.message : 'Verification failed');
      setErrors(errMap);
    } finally {
      setVerifying((prev) => {
        const next = new Set(prev);
        next.delete(run.runId);
        return next;
      });
    }
  };

  const handleReject = async (run: AutonomousRunVerification) => {
    const reason = prompt('Reason for rejection (optional):');

    setVerifying((prev) => new Set([...prev, run.runId]));

    try {
      const result = await getIpcBridge().autonomousVerifyRun({
        runId: run.runId,
        approved: false,
        verifierNotes: reason || 'Rejected via verification panel',
      });

      if (!result.ok) {
        throw new Error(result.reason || 'Rejection failed');
      }

      onRejected?.(run.runId);
    } catch (error) {
      const errMap = new Map(errors);
      errMap.set(run.runId, error instanceof Error ? error.message : 'Rejection failed');
      setErrors(errMap);
    } finally {
      setVerifying((prev) => {
        const next = new Set(prev);
        next.delete(run.runId);
        return next;
      });
    }
  };

  if (!pending.length) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
        No pending verifications
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
      {pending.map((run) => (
        <div
          key={run.runId}
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '12px',
            backgroundColor: '#fafafa',
          }}
        >
          <div style={{ marginBottom: '8px' }}>
            <strong>
              {run.ticketSource.toUpperCase()}{run.ticketId ? ` ${run.ticketId}` : ''}
            </strong>
          </div>

          <div style={{ fontSize: '14px', marginBottom: '8px', color: '#666' }}>
            <div>
              <strong>Summary:</strong> {run.executionSummary}
            </div>
            <div>
              <strong>Files Changed:</strong> {run.filesChanged}
            </div>
            <div>
              <strong>Validation:</strong> {run.validationPassed ? '✅ Passed' : '❌ Failed'}
            </div>
            {run.prUrl && (
              <div>
                <strong>PR:</strong>{' '}
                <a href={run.prUrl} target="_blank" rel="noopener noreferrer">
                  {run.prUrl}
                </a>
              </div>
            )}
            {run.externalUpdateStatus && (
              <div>
                <strong>External Update:</strong> {run.externalUpdateStatus}
              </div>
            )}
          </div>

          {errors.get(run.runId) && (
            <div
              style={{
                padding: '8px',
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                borderRadius: '4px',
                marginBottom: '8px',
                color: '#c00',
                fontSize: '12px',
              }}
            >
              {errors.get(run.runId)}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleApprove(run)}
              disabled={verifying.has(run.runId)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: verifying.has(run.runId) ? 'wait' : 'pointer',
                opacity: verifying.has(run.runId) ? 0.6 : 1,
              }}
            >
              {verifying.has(run.runId) ? 'Approving...' : 'Approve'}
            </button>
            <button
              onClick={() => handleReject(run)}
              disabled={verifying.has(run.runId)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: verifying.has(run.runId) ? 'wait' : 'pointer',
                opacity: verifying.has(run.runId) ? 0.6 : 1,
              }}
            >
              {verifying.has(run.runId) ? 'Processing...' : 'Reject'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
