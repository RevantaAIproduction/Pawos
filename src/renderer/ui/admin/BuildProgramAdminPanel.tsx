import React, { useCallback, useEffect, useState } from 'react';
import dash from '../Dashboard/dashboard.module.css';
import styles from '../Dashboard/sections/career.module.css';
import { buildAdminService, type BuildInsightUser, type BuildUsageSnapshot } from '../../billing/BuildAdminService';
import { downloadBuildUsersSheet } from '../../billing/BuildUsersSheet';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function daysLeft(user: BuildInsightUser, now: number): string {
  if (user.status !== 'active') return user.status === 'revoked' ? 'Revoked' : 'Expired';
  const days = Math.ceil((Date.parse(user.endsAt) - now) / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

const STATUS_LABEL: Record<BuildInsightUser['status'], string> = { active: 'Active', expired: 'Expired', revoked: 'Revoked' };

/** "1,380 of 1,500 PC left" — what remains of one limit, from the student's last usage report. */
function remaining(used: number | undefined, limit: number | null | undefined, unit: string, places = 0): string | null {
  if (typeof limit !== 'number' || typeof used !== 'number') return null;
  const left = Math.max(0, limit - used);
  const fmt = (n: number) => (places ? (Math.round(n * 10 ** places) / 10 ** places).toLocaleString() : Math.round(n).toLocaleString());
  return `${fmt(left)} of ${fmt(limit)} ${unit}`;
}

function UsageCell({ user, now }: { user: BuildInsightUser; now: number }) {
  if (!user.usage) return <span className={styles.hint}>{user.signedIn ? 'No usage yet' : 'Not signed in yet'}</span>;
  const r: BuildUsageSnapshot = user.usage.report;
  const lines = [
    remaining(r.weekPcUsed, r.weekPcLimit, 'PC this week'),
    remaining(r.windowPcUsed, r.windowPcLimit, 'PC this 5h'),
    remaining(r.weekHoursUsed, r.weekHoursLimit, 'h this week', 1),
    remaining(r.fileChangesUsed, r.fileChangesCap, 'files this week'),
  ].filter((l): l is string => l !== null);
  return (
    <div>
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
      <div className={styles.hint}>
        {r.noFurtherReset ? 'Last week — no reset' : r.weekResetsAt ? `Resets ${formatDateTime(r.weekResetsAt)}` : null}
        {' · '}reported {formatAgo(user.usage.reportedAt, now)}
      </div>
    </div>
  );
}

function Details({ user }: { user: BuildInsightUser }) {
  const cell: React.CSSProperties = { padding: '4px 8px 4px 0', verticalAlign: 'top' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, padding: '8px 0 12px' }} data-testid="build-admin-details">
      <div>
        <div className={dash.cardTitle} style={{ fontSize: 12 }}>Ratings</div>
        {user.ratings.items.length === 0 ? (
          <p className={styles.hint}>No ratings.</p>
        ) : (
          user.ratings.items.map((r, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <strong>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</strong> <span className={styles.hint}>{formatDate(r.createdAt)}</span>
              {r.comment ? <div>{r.comment}</div> : null}
            </div>
          ))
        )}
      </div>
      <div>
        <div className={dash.cardTitle} style={{ fontSize: 12 }}>Reports</div>
        {user.reports === null ? (
          <p className={styles.hint}>Reports unavailable.</p>
        ) : user.reports.items.length === 0 ? (
          <p className={styles.hint}>No reports.</p>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {user.reports.items.map((r, i) => (
                <tr key={String(r.id ?? i)}>
                  <td style={cell} className={styles.hint}>{formatDate(r.created_at)}</td>
                  <td style={cell}>{r.type ?? '—'}</td>
                  <td style={cell}>{r.summary ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div>
        <div className={dash.cardTitle} style={{ fontSize: 12 }}>Purchased credits</div>
        {user.purchases === null ? (
          <p className={styles.hint}>Payments unavailable.</p>
        ) : user.purchases.items.length === 0 ? (
          <p className={styles.hint}>{user.signedIn ? 'No purchases.' : 'Not signed in yet.'}</p>
        ) : (
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {user.purchases.items.map((p, i) => (
                <tr key={String(p.id ?? i)}>
                  <td style={cell} className={styles.hint}>{formatDate(p.created_at)}</td>
                  <td style={cell}>{typeof p.amount_usd === 'number' ? `$${p.amount_usd.toFixed(2)}` : '—'}</td>
                  <td style={cell}>{p.status ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * Admin-only, read-only view of PawOS Build students: every granted email with its access dates,
 * how much of each limit is left (from the student's app), the ratings and reports they gave and the
 * Paw Compute they bought. Granting (one 56-day program per email) and revoking happen in the Supabase SQL editor.
 */
export function BuildProgramAdminPanel() {
  const [users, setUsers] = useState<BuildInsightUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const now = Date.now();

  const [downloads, setDownloads] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insights, count] = await Promise.all([buildAdminService.insights(), buildAdminService.exportCount().catch(() => null)]);
      setUsers(insights.users);
      setDownloads(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Every download is logged server-side first (who / when / rows) — the sheet only carries masked emails.
  const download = async () => {
    if (!users) return;
    setDownloading(true);
    setError(null);
    try {
      setDownloads(await buildAdminService.logExport(users.length));
      downloadBuildUsersSheet(users);
    } catch (err) {
      setError(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const q = filter.trim().toLowerCase();
  const visible = (users ?? []).filter((u) => !q || u.email.includes(q) || u.cohortId.toLowerCase().includes(q));
  const active = (users ?? []).filter((u) => u.status === 'active').length;
  const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 };
  const td: React.CSSProperties = { padding: 8, verticalAlign: 'top' };

  return (
    <div data-testid="build-admin-panel">
      <div className={dash.card}>
        <div className={styles.row} style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 className={dash.cardTitle} style={{ margin: 0 }}>
            Build users {users ? `(${active} active of ${users.length})` : ''}
          </h3>
          <div className={styles.row}>
            <input className={styles.input} style={{ width: 220 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by email or cohort" />
            <button type="button" className={styles.linkButton} onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className={styles.linkButton} onClick={() => void download()} disabled={downloading || !users?.length} data-testid="build-admin-download">
              {downloading ? 'Preparing…' : 'Download sheet'}
            </button>
            <span className={styles.hint} data-testid="build-admin-download-count">
              {downloads === null ? '' : `Downloaded ${downloads} time${downloads === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
        <p className={styles.hint} style={{ marginBottom: 12 }}>
          Access is granted in the Supabase SQL editor. Usage is what each student's app last reported. The downloaded
          sheet masks every email (e.g. gh****@gmail.com) and every download is logged.
        </p>
        {error && (
          <div className={styles.error} role="alert" data-testid="build-admin-message">
            {error}
          </div>
        )}
        {users === null ? (
          !error && <p className={dash.cardBody}>Loading…</p>
        ) : visible.length === 0 ? (
          <p className={dash.cardBody}>No Build users yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} data-testid="build-admin-table">
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                  <th style={{ ...th, paddingLeft: 0 }}>Email</th>
                  <th style={th}>Access</th>
                  <th style={th}>Usage remaining</th>
                  <th style={th}>Rating</th>
                  <th style={th}>Reports</th>
                  <th style={th}>Bought credits</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)' }} data-testid="build-admin-row">
                      <td style={{ ...td, paddingLeft: 0 }} title={u.notes ?? undefined}>
                        {u.email}
                        <div className={styles.hint}>{u.cohortId}</div>
                      </td>
                      <td style={td}>
                        {STATUS_LABEL[u.status]} · {daysLeft(u, now)}
                        <div className={styles.hint}>
                          {formatDate(u.startsAt)} → {formatDate(u.status === 'revoked' ? u.revokedAt : u.endsAt)}
                        </div>
                      </td>
                      <td style={td}>
                        <UsageCell user={u} now={now} />
                      </td>
                      <td style={td}>{u.ratings.count ? `★ ${u.ratings.average} (${u.ratings.count})` : '—'}</td>
                      <td style={td}>{u.reports ? u.reports.count : '—'}</td>
                      <td style={td}>{u.purchases ? (u.purchases.count ? `${u.purchases.count} · $${u.purchases.totalUsd.toFixed(2)}` : 'None') : '—'}</td>
                      <td style={td}>
                        <button type="button" className={styles.linkButton} onClick={() => setOpen(open === u.id ? null : u.id)} aria-expanded={open === u.id}>
                          {open === u.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {open === u.id && (
                      <tr>
                        <td colSpan={7} style={{ paddingLeft: 0 }}>
                          <Details user={u} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
