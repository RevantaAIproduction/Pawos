import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** The only capabilities Phase 6 actually wires an approval gate for
 * (DesktopExecutionEngine's deploy/rollback/promote flow) — listing a
 * capability here that nothing enforces would be a toggle that lies about
 * doing something, so this stays limited to what's real rather than the
 * full KNOWN_CAPABILITIES set. */
const GOVERNABLE_CAPABILITIES = [
  { id: 'infra.deploy', label: 'Deploy a project' },
  { id: 'infra.rollback', label: 'Roll back a deployment' },
  { id: 'infra.promote', label: 'Promote staging to production' },
] as const;

/**
 * Section 15's governance policies, made visible: "require approval for
 * infra.deploy" as a checkbox rather than a support ticket. Reads/writes
 * the single 'require_approval' organization_policies row Phase 0's
 * generic policy table already supports — no new storage shape, only a
 * typed convenience over it (see PermissionService.getRequireApprovalCapabilities).
 */
export function GovernancePolicyCard({ organizationId }: { organizationId: string }) {
  const [required, setRequired] = useState<string[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      permissionService.getRequireApprovalCapabilities(organizationId),
      permissionService.hasCapability(organizationId, 'policies.manage'),
    ])
      .then(([caps, manage]) => {
        setRequired(caps);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [organizationId]);

  async function toggle(capability: string) {
    if (!canManage) return;
    const next = required.includes(capability) ? required.filter((c) => c !== capability) : [...required, capability];
    const prev = required;
    setRequired(next);
    try {
      await permissionService.setRequireApprovalCapabilities(organizationId, next);
    } catch (e) {
      setError(getErrorMessage(e));
      setRequired(prev);
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Governance policies</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Require another admin's approval before a member can take these actions. {!canManage && 'Only the owner or a policies manager can change this.'}
      </p>
      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {GOVERNABLE_CAPABILITIES.map(({ id, label }) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input type="checkbox" checked={required.includes(id)} disabled={!canManage} onChange={() => toggle(id)} />
              <span>Require approval to {label.toLowerCase()}</span>
            </label>
          ))}
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
