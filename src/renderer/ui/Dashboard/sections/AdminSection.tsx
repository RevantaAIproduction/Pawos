import React, { useEffect, useState } from 'react';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { isPawosFounderEmail } from '../../../../shared/admin/AdminEmails';
import dash from '../dashboard.module.css';
import tabs from './career.module.css';
import { BuildProgramAdminPanel } from '../../admin/BuildProgramAdminPanel';
import {
  AdminAdminsPanel,
  AdminAuditPanel,
  AdminAutonomousRunsPanel,
  AdminDiagnosticsPanel,
  AdminOverviewPanel,
  AdminPaymentsPanel,
  AdminUsersPanel,
} from '../../admin/AdminPanels';

const ADMIN_TABS = ['Overview', 'Users', 'Build Program', 'Payments', 'Autonomous runs', 'Crash reports', 'Audit log', 'Admins'] as const;
type AdminTab = (typeof ADMIN_TABS)[number];

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="3" y1="3" x2="21" y2="21" />}
    </svg>
  );
}

/**
 * PawOS admin console — reachable only from the sidebar Admin entry, which is shown only to PawOS
 * admin accounts (shared/admin/AdminEmails.ts + the server's pawos_admins list). Every panel reads
 * and writes through SECURITY DEFINER functions that re-authorize the caller server-side.
 *
 * While it is open the window is capture-protected: screenshots, recordings and screen sharing show
 * it blank. Only the founder account gets the eye button to lift that (e.g. to show data on a video
 * call); protection is always restored when the console closes.
 */
export function AdminSection({ viewerEmail }: { viewerEmail?: string | null }) {
  const [tab, setTab] = useState<AdminTab>('Overview');
  const isFounder = isPawosFounderEmail(viewerEmail);
  const [shareable, setShareable] = useState(false);
  const [protectionOk, setProtectionOk] = useState(true);

  useEffect(() => {
    const protect = !(isFounder && shareable);
    ipc
      .systemSetContentProtection(protect)
      .then((ok) => setProtectionOk(ok || !protect))
      .catch(() => setProtectionOk(!protect));
  }, [isFounder, shareable]);

  useEffect(
    () => () => {
      ipc.systemSetContentProtection(false).catch(() => {});
    },
    [],
  );

  return (
    <div data-testid="admin-section">
      <div className={dash.card} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h3 className={dash.cardTitle}>Admin</h3>
          {isFounder && (
            <button
              type="button"
              className={tabs.linkButton}
              onClick={() => setShareable((v) => !v)}
              aria-pressed={shareable}
              title={shareable ? 'Visible to screen sharing — click to hide from screenshots again' : 'Hidden from screenshots — click to show on a screen share'}
              data-testid="admin-visibility-toggle"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <EyeIcon open={shareable} />
              {shareable ? 'Visible for sharing' : 'Hidden from capture'}
            </button>
          )}
        </div>
        <p className={dash.cardBody}>PawOS team tools. Only PawOS admin accounts can see this page, and every action is checked again on the server.</p>
        <p className={tabs.hint} data-testid="admin-capture-status">
          {isFounder && shareable
            ? 'Screen capture is allowed while this is on — screenshots and screen sharing will show this page.'
            : protectionOk
              ? 'Screenshots, screen recordings and screen sharing show this page blank.'
              : 'Screen-capture protection could not be enabled on this system.'}
        </p>
      </div>
      <div className={tabs.tabs} role="tablist">
        {ADMIN_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`${tabs.tab} ${tab === t ? tabs.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Overview' && <AdminOverviewPanel />}
      {tab === 'Users' && <AdminUsersPanel />}
      {tab === 'Build Program' && <BuildProgramAdminPanel />}
      {tab === 'Payments' && <AdminPaymentsPanel />}
      {tab === 'Autonomous runs' && <AdminAutonomousRunsPanel />}
      {tab === 'Crash reports' && <AdminDiagnosticsPanel />}
      {tab === 'Audit log' && <AdminAuditPanel />}
      {tab === 'Admins' && <AdminAdminsPanel />}
    </div>
  );
}
