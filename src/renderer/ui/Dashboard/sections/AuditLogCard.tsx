import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { permissionService } from '../../../organization/PermissionService';
import type { AuditLogEntry } from '../../../../shared/organization/PermissionTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function describe(entry: AuditLogEntry): string {
  return `${entry.action} ${entry.entityType}`;
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
};

/** Minimal CSV escaping — wraps a field in quotes and doubles any quote it
 * contains, per RFC 4180, so entity ids/action names with commas still
 * round-trip correctly in Excel/Sheets. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(entries: AuditLogEntry[]): string {
  const header = ['created_at', 'actor_user_id', 'action', 'entity_type', 'entity_id'].map(csvField).join(',');
  const rows = entries.map((e) =>
    [e.createdAt, e.actorUserId ?? '', e.action, e.entityType, e.entityId ?? ''].map((v) => csvField(String(v))).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generic append-only trail — Phase 0 audits role/policy/membership
 * changes, Phase 6 adds credential/approval-request changes; every phase
 * extends the same audit_log table rather than building a separate log
 * per feature. Phase 6 adds search/date-range filtering and CSV export
 * over this same data — most of SOC 2/ISO 27001 evidence-gathering is
 * "can you produce this," which this card now does directly.
 */
export function AuditLogCard({ organizationId }: { organizationId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  useEffect(() => {
    permissionService
      .listAuditLog(organizationId, 200)
      .then(setEntries)
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const filtered = entries.filter((entry) => {
    if (search.trim() && !describe(entry).toLowerCase().includes(search.trim().toLowerCase())) return false;
    const createdAt = new Date(entry.createdAt).getTime();
    if (fromDate && createdAt < new Date(fromDate).getTime()) return false;
    if (toDate && createdAt > new Date(toDate).getTime() + 24 * 60 * 60 * 1000) return false;
    return true;
  });

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Audit</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Role, policy, membership, credential, and approval changes in this organization. Visible only to roles with
        audit-view access — an empty list below can mean either nothing has changed yet, or that this account
        doesn't have that access.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input style={{ ...inputStyle, flex: 1, minWidth: 160 }} placeholder="Search action/entity…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <input type="date" style={inputStyle} value={fromDate} onChange={(e) => setFromDate(e.target.value)} title="From date" />
        <input type="date" style={inputStyle} value={toDate} onChange={(e) => setToDate(e.target.value)} title="To date" />
        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => downloadCsv(`audit-log-${organizationId}.csv`, toCsv(filtered))}
        >
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className={styles.cardBody}>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className={styles.cardBody}>{entries.length === 0 ? 'No audit events yet.' : 'No events match this filter.'}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {filtered.map((entry) => (
            <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{describe(entry)}</span>
              <span style={{ color: '#96969e' }}>{new Date(entry.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
