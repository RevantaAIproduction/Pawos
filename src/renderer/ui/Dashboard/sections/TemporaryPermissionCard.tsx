import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { temporaryPermissionService, isTemporaryPermissionActive } from '../../../organization/TemporaryPermissionService';
import { permissionService } from '../../../organization/PermissionService';
import { KNOWN_CAPABILITIES } from '../../../../shared/organization/PermissionTypes';
import type { OrganizationTemporaryPermission } from '../../../../shared/organization/TemporaryPermissionTypes';
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

const DURATION_OPTIONS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];

/**
 * Phase 2 — time-bound capability grants. Visible: your own grants
 * always; every grant in the org if you hold permissions.grant. Grant
 * and revoke are both gated by permissions.grant server-side (RLS) — this
 * component only shows the controls when it expects them to succeed.
 * Expiration is enforced live by has_capability(), not a background job:
 * an expired grant here just reads as "expired" on the next reload.
 */
export function TemporaryPermissionCard({ organizationId, orgMembers }: { organizationId: string; orgMembers: OrganizationMember[] }) {
  const [grants, setGrants] = useState<OrganizationTemporaryPermission[]>([]);
  const [canGrant, setCanGrant] = useState(false);
  const [pickedMemberId, setPickedMemberId] = useState('');
  const [pickedCapability, setPickedCapability] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reload() {
    Promise.all([temporaryPermissionService.listForOrganization(organizationId), permissionService.hasCapability(organizationId, 'permissions.grant')])
      .then(([g, canGrantValue]) => {
        setGrants(g);
        setCanGrant(canGrantValue);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }

  useEffect(reload, [organizationId]);

  async function grant() {
    if (!pickedMemberId || !pickedCapability) return;
    setError(null);
    try {
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
      await temporaryPermissionService.grant(organizationId, pickedMemberId, pickedCapability, expiresAt, reason.trim() || undefined);
      setPickedMemberId('');
      setPickedCapability('');
      setReason('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  async function revoke(grantId: string) {
    setError(null);
    try {
      await temporaryPermissionService.revoke(grantId);
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }

  function memberLabel(userId: string): string {
    const member = orgMembers.find((m) => m.userId === userId);
    return member?.displayName || member?.email || userId;
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Temporary Permissions</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Grant a specific capability to a member for a limited time — it expires automatically, no manual cleanup needed.
        {!canGrant && ' Only the owner or a permissions.grant holder can grant or revoke.'}
      </p>

      {grants.length === 0 && <p className={styles.cardBody}>No temporary grants.</p>}
      {grants.map((g) => {
        const active = isTemporaryPermissionActive(g);
        return (
          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
            <div>
              <div>
                {memberLabel(g.userId)} — <strong>{g.capability}</strong>
              </div>
              <div style={{ fontSize: 11.5, color: '#96969e' }}>
                {g.revokedAt ? 'revoked' : active ? `expires ${new Date(g.expiresAt).toLocaleString()}` : 'expired'}
                {g.reason ? ` — ${g.reason}` : ''}
              </div>
            </div>
            {canGrant && active && (
              <button type="button" className={styles.primaryButton} onClick={() => revoke(g.id)}>
                Revoke
              </button>
            )}
          </div>
        );
      })}

      {canGrant && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, flex: 1 }} value={pickedMemberId} onChange={(e) => setPickedMemberId(e.target.value)}>
            <option value="">Member…</option>
            {orgMembers
              .filter((m) => m.userId)
              .map((m) => (
                <option key={m.userId ?? m.id} value={m.userId ?? ''}>
                  {m.displayName || m.email}
                </option>
              ))}
          </select>
          <select style={{ ...inputStyle, flex: 1 }} value={pickedCapability} onChange={(e) => setPickedCapability(e.target.value)}>
            <option value="">Capability…</option>
            {KNOWN_CAPABILITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select style={{ ...inputStyle }} value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}>
            {DURATION_OPTIONS.map((d) => (
              <option key={d.hours} value={d.hours}>
                {d.label}
              </option>
            ))}
          </select>
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className={styles.primaryButton} disabled={!pickedMemberId || !pickedCapability} onClick={grant}>
            Grant
          </button>
        </div>
      )}

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
