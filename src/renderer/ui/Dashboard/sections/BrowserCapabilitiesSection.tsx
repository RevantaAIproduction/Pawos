import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { BrowserCapabilityReport } from '../../../../shared/actions/BrowserCapabilityTypes';

const STATUS_TEXT: Record<BrowserCapabilityReport['realProfileReuse']['status'], string> = {
  working: 'Real-profile reuse verified',
  blocked: 'Real-profile reuse unavailable',
  untested: 'Real-profile reuse not yet tried',
  unsupported: 'Real-profile reuse not implemented for this browser',
};

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0' }}>
      <span style={{ color: ok ? '#7ee787' : '#6c6c74', width: 14, textAlign: 'center' }}>{ok ? '✓' : '—'}</span>
      <span style={{ color: ok ? '#f5f5f7' : '#6c6c74' }}>{label}</span>
    </div>
  );
}

/**
 * Read-only capability matrix per browser — every value here comes from
 * the same BrowserAdapter.capabilities Set every plugin's capability gate
 * already checks (never a separately-maintained list that could drift),
 * except realProfileReuse: whether "reuse my real login" actually works
 * depends on the user's specific profile, not the browser vendor, so it
 * reflects the last real observed attempt rather than an assumption —
 * every browser starts "not yet tried" until the user actually asks Paw
 * to reuse a session.
 */
export function BrowserCapabilitiesSection() {
  const ipc = useIpcBridge();
  const [reports, setReports] = useState<BrowserCapabilityReport[] | null>(null);

  useEffect(() => {
    ipc.getBrowserCapabilities().then(setReports).catch(() => setReports([]));
  }, [ipc]);

  if (reports === null) {
    return <p className={styles.cardBody}>Checking installed browsers…</p>;
  }

  return (
    <div className={styles.grid}>
      {reports.map((r) => {
        const reuse = r.realProfileReuse;
        const reuseColor = reuse.status === 'working' ? '#7ee787' : reuse.status === 'blocked' ? '#ff8a8a' : '#96969e';
        const reuseIcon = reuse.status === 'working' ? '✓' : reuse.status === 'blocked' ? '⚠' : '—';
        return (
          <div key={r.id} className={styles.card}>
            <h3 className={styles.cardTitle}>
              {r.displayName}
              {!r.installed && <span style={{ color: '#6c6c74', fontWeight: 400 }}> — not installed</span>}
            </h3>

            {r.installed ? (
              <>
                {r.capabilities.map((c) => (
                  <Row key={c.key} label={c.label} ok={c.supported} />
                ))}
                {r.sessionAttach && <Row label="Session Attach" ok />}

                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ color: reuseColor, width: 14, textAlign: 'center' }}>{reuseIcon}</span>
                    <span style={{ color: reuseColor }}>{STATUS_TEXT[reuse.status]}</span>
                  </div>
                  {reuse.reason && (
                    <p className={styles.cardBody} style={{ marginTop: 6, marginLeft: 22 }}>
                      Reason: {reuse.reason}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className={styles.cardBody}>Install {r.displayName} to use it for browsing tasks.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
