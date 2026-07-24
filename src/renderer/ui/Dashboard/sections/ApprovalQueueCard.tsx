import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';
import { approvalRequestService } from '../../../organization/ApprovalRequestService';
import type { ApprovalRequest } from '../../../../shared/organization/GovernanceTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Section 15's approval workflow, generalized from Section 5's Remote
 * Assistance request/decide flow: any pending organization_approval_requests
 * row an approvals.decide holder can act on. Requesters see their own
 * pending/decided requests below the queue so a governance-gated action
 * has somewhere to point them while they wait.
 */
export function ApprovalQueueCard({ organizationId }: { organizationId: string }) {
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const [mine, setMine] = useState<ApprovalRequest[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    Promise.all([
      approvalRequestService.listPending(organizationId),
      approvalRequestService.listMine(organizationId),
      permissionService.hasCapability(organizationId, 'approvals.decide'),
    ])
      .then(([pendingRequests, myRequests, decide]) => {
        setPending(pendingRequests);
        setMine(myRequests);
        setCanDecide(decide);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    return approvalRequestService.subscribeToRequests(organizationId, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function decide(id: string, decision: 'approved' | 'denied') {
    setBusyId(id);
    setError(null);
    try {
      await approvalRequestService.decide(id, decision);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Approvals</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Approvals</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Actions gated by a governance policy wait here until an admin decides.
      </p>

      {canDecide && (
        <div style={{ marginBottom: 14 }}>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Pending your decision</p>
          {pending.length === 0 ? (
            <p className={styles.cardBody}>Nothing pending.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map((req) => (
                <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ flex: 1, fontSize: 13 }}>{req.summary}</div>
                  <button type="button" className={styles.primaryButton} disabled={busyId === req.id} onClick={() => decide(req.id, 'approved')}>
                    Approve
                  </button>
                  <button type="button" disabled={busyId === req.id} onClick={() => decide(req.id, 'denied')}>
                    Deny
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Your requests</p>
      {mine.length === 0 ? (
        <p className={styles.cardBody}>You haven't requested any gated action yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mine.map((req) => (
            <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{req.summary}</span>
              <span style={{ color: req.status === 'approved' ? '#8ce0a8' : req.status === 'denied' ? '#e08c8c' : '#96969e' }}>{req.status}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
