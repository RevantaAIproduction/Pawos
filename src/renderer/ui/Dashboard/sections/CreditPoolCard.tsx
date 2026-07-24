import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { creditPoolService } from '../../../organization/CreditPoolService';
import { permissionService } from '../../../organization/PermissionService';
import type { OrganizationCreditSummary } from '../../../../shared/organization/CreditPoolTypes';
import type { OrganizationMember } from '../../../../shared/organization/OrganizationTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

/**
 * Phase 1 — organization credit pools. Additive to the existing local,
 * per-device CreditStore (Individual/Guest accounts never touch this).
 * total_credits starts at 0 until an admin sets a real pool size —
 * that's the honest starting state, not a bug.
 */
export function CreditPoolCard({ organizationId, orgMembers }: { organizationId: string; orgMembers: OrganizationMember[] }) {
  const [summary, setSummary] = useState<OrganizationCreditSummary | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [poolTotal, setPoolTotal] = useState('');
  const [pickedMemberId, setPickedMemberId] = useState('');
  const [allocationAmount, setAllocationAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([creditPoolService.getSummary(organizationId), permissionService.hasCapability(organizationId, 'credits.manage')])
      .then(([s, manage]) => {
        setSummary(s);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }

  useEffect(reload, [organizationId]);

  async function setTotal() {
    const value = Number(poolTotal);
    if (!Number.isFinite(value) || value < 0) return;
    setError(null);
    try {
      await creditPoolService.setPoolTotal(organizationId, value);
      setPoolTotal('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function allocate() {
    const value = Number(allocationAmount);
    if (!pickedMemberId || !Number.isFinite(value) || value < 0) return;
    setError(null);
    try {
      await creditPoolService.allocateToMember(organizationId, pickedMemberId, value);
      setPickedMemberId('');
      setAllocationAmount('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  const joinedMembers = orgMembers.filter((m) => m.userId);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Credits</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        {!canManage && 'Only a billing administrator or the owner can change the pool or allocations.'}
      </p>

      {summary && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 13 }}>
          <div>
            <div style={{ color: '#96969e', fontSize: 11.5 }}>Pool total</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.pool?.totalCredits ?? 0}</div>
          </div>
          <div>
            <div style={{ color: '#96969e', fontSize: 11.5 }}>Used this period</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.usedThisPeriod}</div>
          </div>
          <div>
            <div style={{ color: '#96969e', fontSize: 11.5 }}>Remaining</div>
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>{summary.remaining ?? '—'}</div>
          </div>
        </div>
      )}

      {canManage && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Set pool total credits"
              value={poolTotal}
              onChange={(e) => setPoolTotal(e.target.value)}
              inputMode="numeric"
            />
            <button type="button" className={styles.primaryButton} disabled={!poolTotal.trim()} onClick={setTotal}>
              Set
            </button>
          </div>

          <div style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Member allocations</div>
          {(summary?.allocations ?? []).map((a) => (
            <div key={a.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
              {a.allocationType === 'member'
                ? orgMembers.find((m) => m.userId === a.targetUserId)?.displayName || orgMembers.find((m) => m.userId === a.targetUserId)?.email || a.targetUserId
                : a.departmentName}
              <span style={{ color: '#96969e', marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{a.allocatedCredits}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={pickedMemberId} onChange={(e) => setPickedMemberId(e.target.value)}>
              <option value="">Allocate to member…</option>
              {joinedMembers.map((m) => (
                <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                  {m.displayName || m.email}
                </option>
              ))}
            </select>
            <input style={{ ...inputStyle, width: 90 }} placeholder="Credits" value={allocationAmount} onChange={(e) => setAllocationAmount(e.target.value)} inputMode="numeric" />
            <button type="button" className={styles.primaryButton} disabled={!pickedMemberId || !allocationAmount.trim()} onClick={allocate}>
              Allocate
            </button>
          </div>
        </>
      )}

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
