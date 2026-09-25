import React, { useCallback, useEffect, useState } from 'react';
import dash from '../Dashboard/dashboard.module.css';
import styles from '../Dashboard/sections/career.module.css';
import {
  adminService,
  type AdminAccount,
  type AdminAuditEntry,
  type AdminOverview,
  type AdminRow,
  type AdminUserDetail,
  type AdminUserSummary,
} from '../../billing/AdminService';
import { AdminDataTable, AdminNotes, formatAdminValue } from './AdminDataTable';

/** Loads `fn` on mount and on refresh(); surfaces errors instead of swallowing them. */
function useAdminQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { data, error, loading, refresh };
}

function PanelHeader({ title, onRefresh, loading, children }: { title: string; onRefresh: () => void; loading: boolean; children?: React.ReactNode }) {
  return (
    <div className={styles.row} style={{ justifyContent: 'space-between', marginBottom: 10 }}>
      <h3 className={dash.cardTitle} style={{ margin: 0 }}>{title}</h3>
      <div className={styles.row}>
        {children}
        <button type="button" className={styles.linkButton} onClick={onRefresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={dash.card} style={{ padding: 14 }}>
      <div style={{ fontSize: 11, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────────────────────────
export function AdminOverviewPanel() {
  const { data, error, loading, refresh } = useAdminQuery<AdminOverview>(() => adminService.overview());
  return (
    <div className={dash.card} data-testid="admin-overview">
      <PanelHeader title="Overview" onRefresh={refresh} loading={loading} />
      <ErrorBox error={error} />
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <Stat label="Users" value={formatAdminValue(data.users)} hint={`+${data.newUsers7d} this week · +${data.newUsers30d} in 30 days`} />
            <Stat label="Active (signed in, 7 days)" value={formatAdminValue(data.activeUsers7d)} />
            <Stat label="PawOS Build" value={formatAdminValue(data.buildActive)} hint={`${data.buildTotal} granted in total`} />
            {data.organizations !== undefined && <Stat label="Organizations" value={formatAdminValue(data.organizations)} />}
            {data.usageCreditPayments && (
              <Stat label="Credit payments (30 days)" value={`$${formatAdminValue(data.usageCreditPayments.amountUsd30d)}`} hint={`${data.usageCreditPayments.count30d} payments`} />
            )}
            {data.autonomousRuns && (
              <Stat
                label="Autonomous runs active"
                value={formatAdminValue(data.autonomousRuns.active)}
                hint={`${data.autonomousRuns.staleOver24h} older than 24 h · ${data.autonomousRuns.last7d} started this week`}
              />
            )}
            {data.diagnosticIssuesByStatus && (
              <Stat
                label="Crash / diagnostic issues"
                value={formatAdminValue(Object.values(data.diagnosticIssuesByStatus).reduce((a, b) => a + b, 0))}
                hint={Object.entries(data.diagnosticIssuesByStatus).map(([k, v]) => `${v} ${k}`).join(' · ') || undefined}
              />
            )}
            {data.waitlist !== undefined && <Stat label="Waitlist" value={formatAdminValue(data.waitlist)} />}
            <Stat label="Admins" value={formatAdminValue(data.admins)} />
          </div>
          <p className={dash.cardBody} style={{ fontSize: 11, opacity: 0.55, marginTop: 10 }}>As of {formatAdminValue(data.generatedAt)}</p>
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

// ── Users ───────────────────────────────────────────────────────────────────────────────────────
function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data, error, loading, refresh } = useAdminQuery<AdminUserDetail>(() => adminService.userDetail(userId), [userId]);
  const section = (title: string, rows: AdminRow[] | undefined, preferred: string[]) => (
    <div style={{ marginTop: 16 }}>
      <div className={styles.subheading}>{title}</div>
      <AdminDataTable rows={rows} preferred={preferred} emptyText={`No ${title.toLowerCase()}.`} />
    </div>
  );
  return (
    <div className={dash.card} data-testid="admin-user-detail">
      <PanelHeader title={data?.user.email ?? 'User'} onRefresh={refresh} loading={loading}>
        <button type="button" className={styles.linkButton} onClick={onBack}>
          ← All users
        </button>
      </PanelHeader>
      <ErrorBox error={error} />
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            <Stat label="Signed up" value={<span style={{ fontSize: 14 }}>{formatAdminValue(data.user.createdAt)}</span>} />
            <Stat label="Last sign-in" value={<span style={{ fontSize: 14 }}>{formatAdminValue(data.user.lastSignInAt)}</span>} />
            <Stat label="Sign-in method" value={<span style={{ fontSize: 14 }}>{(data.user.providers ?? [data.user.provider]).filter(Boolean).join(', ') || '—'}</span>} />
            <Stat label="Email confirmed" value={<span style={{ fontSize: 14 }}>{data.user.emailConfirmedAt ? 'Yes' : 'No'}</span>} />
            <Stat
              label="PawOS Build"
              value={<span style={{ fontSize: 14 }}>{data.build ? String(data.build.status) : 'None'}</span>}
              hint={data.build ? `until ${formatAdminValue(data.build.endsAt)}` : undefined}
            />
            {data.usageCredits !== undefined && (
              <Stat label="Usage credits" value={<span style={{ fontSize: 14 }}>{data.usageCredits ? `$${formatAdminValue(data.usageCredits.balance_usd)}` : '$0'}</span>} />
            )}
            <Stat label="Admin" value={<span style={{ fontSize: 14 }}>{data.isAdmin ? 'Yes' : 'No'}</span>} />
          </div>
          <p className={dash.cardBody} style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>User id: {data.user.id}</p>
          {section('Organizations', data.organizations, ['organization', 'role', 'created_at'])}
          {section('Devices', data.deviceSessions, ['device_name', 'platform', 'last_seen_at', 'revoked_at', 'created_at'])}
          {section('Credit payments', data.usageCreditPayments, ['amount_usd', 'created_at'])}
          {section('Credit usage', data.usageCreditDeductions, ['amount_usd', 'usage_event_id', 'created_at'])}
          {section('Autonomous runs', data.autonomousRuns, ['status', 'ticket_id', 'created_at'])}
          {section('Crash reports', data.diagnosticReports, ['summary', 'app_version', 'created_at'])}
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

export function AdminUsersPanel() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, error, loading, refresh } = useAdminQuery<AdminUserSummary[]>(() => adminService.searchUsers(submitted, 100), [submitted]);

  if (selected) return <UserDetail userId={selected} onBack={() => setSelected(null)} />;

  return (
    <div className={dash.card} data-testid="admin-users">
      <PanelHeader title={`Users${data ? ` (${data.length}${data.length === 100 ? '+' : ''})` : ''}`} onRefresh={refresh} loading={loading} />
      <form
        className={styles.row}
        style={{ marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
      >
        <input className={styles.input} style={{ flex: 1 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by email or user id" />
        <button type="submit" className={dash.primaryButton}>Search</button>
      </form>
      <ErrorBox error={error} />
      {data && data.length === 0 && <p className={dash.cardBody}>No users match.</p>}
      {data && data.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '6px 8px 6px 0' }}>Email</th>
                <th style={{ padding: 6 }}>Signed up</th>
                <th style={{ padding: 6 }}>Last sign-in</th>
                <th style={{ padding: 6 }}>Method</th>
                <th style={{ padding: 6 }}>Build</th>
                <th style={{ padding: 6 }} />
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)' }}>
                  <td style={{ padding: '7px 8px 7px 0' }}>
                    {u.email ?? '—'}
                    {u.isAdmin && <span className={styles.chip} style={{ marginLeft: 6 }}>admin</span>}
                    {!u.emailConfirmed && <span className={styles.chip} style={{ marginLeft: 6 }}>unconfirmed</span>}
                  </td>
                  <td style={{ padding: 6 }}>{formatAdminValue(u.createdAt)}</td>
                  <td style={{ padding: 6 }}>{formatAdminValue(u.lastSignInAt)}</td>
                  <td style={{ padding: 6 }}>{u.provider ?? '—'}</td>
                  <td style={{ padding: 6 }}>{u.buildStatus ?? '—'}</td>
                  <td style={{ padding: 6 }}>
                    <button type="button" className={styles.linkButton} onClick={() => setSelected(u.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Payments ────────────────────────────────────────────────────────────────────────────────────
export function AdminPaymentsPanel() {
  const { data, error, loading, refresh } = useAdminQuery(() => adminService.payments(100));
  return (
    <div className={dash.card} data-testid="admin-payments">
      <PanelHeader title="Payments" onRefresh={refresh} loading={loading} />
      <ErrorBox error={error} />
      {data && (
        <>
          <div className={styles.subheading}>Usage credit payments</div>
          <AdminDataTable rows={data.usageCreditPayments} preferred={['email', 'amount_usd', 'created_at']} emptyText="No credit payments yet." />
          <div className={styles.subheading}>Organization billing events</div>
          <AdminDataTable rows={data.organizationBillingEvents} preferred={['email', 'event_type', 'status', 'amount_usd', 'organization_id', 'created_at']} emptyText="No organization billing events yet." />
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

// ── Autonomous runs ─────────────────────────────────────────────────────────────────────────────
export function AdminAutonomousRunsPanel() {
  const [activeOnly, setActiveOnly] = useState(true);
  const { data, error, loading, refresh } = useAdminQuery(() => adminService.autonomousRuns(activeOnly, 100), [activeOnly]);
  const stale = (data?.runs ?? []).filter((r) => Number(r.ageHours) >= 24 && ['queued', 'running', 'waiting_for_permission', 'waiting_for_topup', 'blocked'].includes(String(r.status)));
  return (
    <div className={dash.card} data-testid="admin-autonomous">
      <PanelHeader title="Autonomous runs" onRefresh={refresh} loading={loading}>
        <label className={styles.row} style={{ fontSize: 12, gap: 6 }}>
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Active only
        </label>
      </PanelHeader>
      <ErrorBox error={error} />
      {stale.length > 0 && (
        <p className={dash.cardBody} style={{ marginBottom: 8 }}>
          {stale.length} run{stale.length === 1 ? ' has' : 's have'} been open for over 24 hours. The desktop app closes stale runs on its next start (reconcileStaleRuns); settlement always goes through the normal billing path.
        </p>
      )}
      {data && (
        <>
          <AdminDataTable rows={data.runs} preferred={['email', 'status', 'ageHours', 'ticket_id', 'organization_id', 'created_at']} emptyText={activeOnly ? 'No active autonomous runs.' : 'No autonomous runs yet.'} />
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

// ── Diagnostics ─────────────────────────────────────────────────────────────────────────────────
export function AdminDiagnosticsPanel() {
  const { data, error, loading, refresh } = useAdminQuery(() => adminService.diagnostics(100));
  return (
    <div className={dash.card} data-testid="admin-diagnostics">
      <PanelHeader title="Crash reports" onRefresh={refresh} loading={loading} />
      <ErrorBox error={error} />
      {data && (
        <>
          <div className={styles.subheading}>Issues</div>
          <AdminDataTable rows={data.issues} preferred={['status', 'created_at']} emptyText="No diagnostic issues." />
          <div className={styles.subheading}>Latest reports</div>
          <AdminDataTable rows={data.reports} preferred={['email', 'summary', 'app_version', 'issue_id', 'created_at']} emptyText="No diagnostic reports." />
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────────────────────────
export function AdminAuditPanel() {
  const { data, error, loading, refresh } = useAdminQuery(() => adminService.audit(200));
  const rows: AdminRow[] | undefined = data?.entries.map((e: AdminAuditEntry) => ({
    at: e.at,
    actor: e.actor,
    action: e.action,
    target: e.target,
    detail: e.detail && Object.keys(e.detail).length > 0 ? e.detail : null,
  }));
  return (
    <div className={dash.card} data-testid="admin-audit">
      <PanelHeader title="Audit log" onRefresh={refresh} loading={loading} />
      <ErrorBox error={error} />
      {data && (
        <>
          <AdminDataTable rows={rows} preferred={['at', 'actor', 'action', 'target', 'detail']} emptyText="No admin actions recorded yet." />
          <AdminNotes notes={data.notes} />
        </>
      )}
    </div>
  );
}

// ── Admins ──────────────────────────────────────────────────────────────────────────────────────
export function AdminAdminsPanel() {
  const { data, error, loading, refresh } = useAdminQuery<AdminAccount[]>(() => adminService.listAdmins());
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const act = async (fn: () => Promise<{ result: string; email: string }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      setMessage({
        kind: 'ok',
        text: r.result === 'added' ? `${r.email} is now an admin.` : r.result === 'already_admin' ? `${r.email} is already an admin.` : `${r.email} is no longer an admin.`,
      });
      setEmail('');
      await refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={dash.card} data-testid="admin-admins">
      <PanelHeader title="Admins" onRefresh={refresh} loading={loading} />
      <p className={dash.cardBody} style={{ marginBottom: 12 }}>
        Admins can use this console, grant PawOS Build, and manage the help center. Changes apply immediately and are recorded in the audit log.
      </p>
      <form
        className={styles.row}
        style={{ marginBottom: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          void act(() => adminService.addAdmin(email));
        }}
      >
        <input className={styles.input} style={{ flex: 1 }} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@revantaai.com" />
        <button type="submit" className={dash.primaryButton} disabled={busy || !email.trim()}>
          Add admin
        </button>
      </form>
      {message && (
        <div className={message.kind === 'error' ? styles.error : styles.success} role={message.kind === 'error' ? 'alert' : 'status'} style={{ marginBottom: 10 }}>
          {message.text}
        </div>
      )}
      <ErrorBox error={error} />
      {data && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {data.map((a) => (
              <tr key={a.email} style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)' }}>
                <td style={{ padding: '8px 8px 8px 0' }}>
                  {a.email}
                  {a.isYou && <span className={styles.chip} style={{ marginLeft: 6 }}>you</span>}
                  {!a.hasAccount && <span className={styles.chip} style={{ marginLeft: 6 }}>no account yet</span>}
                </td>
                <td style={{ padding: 8, opacity: 0.7 }}>added {formatAdminValue(a.addedAt)}</td>
                <td style={{ padding: '8px 0', textAlign: 'right' }}>
                  {!a.isYou && (
                    <button
                      type="button"
                      className={styles.linkButton}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Remove admin access for ${a.email}?`)) void act(() => adminService.removeAdmin(a.email));
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
