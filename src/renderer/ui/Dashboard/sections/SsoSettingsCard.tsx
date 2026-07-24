import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const POLICY_KEY = 'sso_config';

type SsoConfig = {
  enabled: boolean;
  provider: 'saml' | 'oidc';
  metadataUrl: string;
};

const EMPTY: SsoConfig = { enabled: false, provider: 'saml', metadataUrl: '' };

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

/**
 * Section 15's SSO readiness item, honestly scoped: Supabase Auth already
 * supports SAML/OIDC providers at the project level (dashboard-configured,
 * not app code — "an enablement/config task per enterprise customer, not
 * new engineering," per the roadmap). This card lets an org record its own
 * SSO intent/metadata (stored as a Phase 0 organization_policies row,
 * policies.manage-gated exactly like Governance policies above — no
 * separate write path), and states plainly that turning it on for real
 * sign-in requires a one-time Supabase project configuration step, the
 * same honesty precedent as this project's other "real backend exists,
 * some setup is manual" disclosures (e.g. the SMTP email service).
 */
export function SsoSettingsCard({ organizationId, tier }: { organizationId: string; tier: 'team' | 'enterprise' }) {
  const [config, setConfig] = useState<SsoConfig>(EMPTY);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      permissionService.listPolicies(organizationId),
      permissionService.hasCapability(organizationId, 'policies.manage'),
    ])
      .then(([policies, manage]) => {
        const row = policies.find((p) => p.policyKey === POLICY_KEY);
        if (row) setConfig({ ...EMPTY, ...(row.policyValue as Partial<SsoConfig>) });
        setCanManage(manage);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [organizationId]);

  async function save(next: SsoConfig) {
    setConfig(next);
    setSaving(true);
    setError(null);
    try {
      await permissionService.setPolicy(organizationId, POLICY_KEY, next as unknown as Record<string, unknown>);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (tier !== 'enterprise') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Single sign-on</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          SSO (SAML/OIDC) is available on Paw Enterprise. Upgrade from Team to configure it for this organization.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Single sign-on</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Record your identity provider here, then ask Paw support to enable it on the underlying Supabase project —
        SAML/OIDC sign-in itself is a one-time project-level configuration step, not something this app can turn on
        by itself. {!canManage && 'Only the owner or a policies manager can change this.'}
      </p>
      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={config.enabled}
              disabled={!canManage || saving}
              onChange={(e) => save({ ...config, enabled: e.target.checked })}
            />
            <span>We want SSO enabled for this organization</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              style={inputStyle}
              value={config.provider}
              disabled={!canManage || saving}
              onChange={(e) => save({ ...config, provider: e.target.value as SsoConfig['provider'] })}
            >
              <option value="saml">SAML</option>
              <option value="oidc">OIDC</option>
            </select>
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 220 }}
              placeholder="Identity provider metadata URL"
              value={config.metadataUrl}
              disabled={!canManage || saving}
              onChange={(e) => setConfig({ ...config, metadataUrl: e.target.value })}
              onBlur={() => save(config)}
            />
          </div>
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
