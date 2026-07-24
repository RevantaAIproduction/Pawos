import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';
import { credentialVaultService } from '../../../organization/CredentialVaultService';
import type { OrgCredential, OrgCredentialConnectorKind } from '../../../../shared/organization/GovernanceTypes';

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

/** The token-shaped connectors org credentials can actually back — matches
 * InfrastructureConnectorRegistry's kinds, excluding the CLI-detected ones
 * (aws/gcp/azure/docker/kubernetes), which authenticate via the local
 * machine's own CLI session, not a bearer token this vault could hold. */
const CONNECTORS: { kind: OrgCredentialConnectorKind; id: string; label: string }[] = [
  { kind: 'sourceControl', id: 'github', label: 'GitHub' },
  { kind: 'sourceControl', id: 'gitlab', label: 'GitLab' },
  { kind: 'projectManagement', id: 'linear', label: 'Linear' },
  { kind: 'hosting', id: 'vercel', label: 'Vercel' },
  { kind: 'hosting', id: 'netlify', label: 'Netlify' },
];

/**
 * Section 2/3's "shared infrastructure" gap, closed: one org-wide
 * connector credential instead of every member configuring their own
 * .env token. The secret is encrypted server-side (pgcrypto, via
 * store_organization_credential) before it ever reaches a table row —
 * this card never renders a decrypted value, only metadata plus a
 * write-only "Update" field.
 */
export function CredentialVaultCard({ organizationId }: { organizationId: string }) {
  const [credentials, setCredentials] = useState<OrgCredential[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(CONNECTORS[0]);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  function reload() {
    Promise.all([
      credentialVaultService.list(organizationId),
      permissionService.hasCapability(organizationId, 'credentials.manage'),
    ])
      .then(([creds, manage]) => {
        setCredentials(creds);
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [organizationId]);

  async function save() {
    if (!secret.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await credentialVaultService.store(organizationId, selected.kind, selected.id, label.trim() || selected.label, secret.trim());
      setSecret('');
      setLabel('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(cred: OrgCredential) {
    setBusy(true);
    setError(null);
    try {
      await credentialVaultService.revoke(organizationId, cred.connectorKind, cred.connectorId);
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Credential vault</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        One shared connector credential per service, usable by every permitted member instead of each person
        configuring their own. Stored encrypted; only credentials.manage can read or write it.
      </p>

      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : credentials.length === 0 ? (
        <p className={styles.cardBody}>No shared credentials yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: canManage ? 14 : 0 }}>
          {credentials.map((cred) => (
            <div key={cred.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{cred.label}</div>
                <div style={{ fontSize: 12, color: '#96969e' }}>{cred.connectorKind} · {cred.connectorId}</div>
              </div>
              {canManage && (
                <button type="button" disabled={busy} onClick={() => revoke(cred)}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              style={inputStyle}
              value={`${selected.kind}:${selected.id}`}
              onChange={(e) => setSelected(CONNECTORS.find((c) => `${c.kind}:${c.id}` === e.target.value) ?? CONNECTORS[0])}
            >
              {CONNECTORS.map((c) => (
                <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.label}</option>
              ))}
            </select>
            <input style={{ ...inputStyle, flex: 1, minWidth: 140 }} placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="password"
              style={{ ...inputStyle, flex: 1 }}
              placeholder={`${selected.label} token`}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <button type="button" className={styles.primaryButton} disabled={busy || !secret.trim()} onClick={save}>
              Save
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
