import React, { useState } from 'react';
import dash from '../Dashboard/dashboard.module.css';
import type { AdminRow } from '../../billing/AdminService';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatAdminValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return value;
  }
  return JSON.stringify(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Renders rows whose columns come from the live database (schemas drift from the migration files),
 * so columns are derived from the rows themselves: `preferred` keys first (when present), then the
 * rest. Long values are truncated in the cell and shown in full via the row's detail toggle.
 */
export function AdminDataTable({
  rows,
  preferred = [],
  hidden = [],
  maxColumns = 8,
  emptyText = 'Nothing to show.',
  testId,
}: {
  rows: AdminRow[] | undefined;
  preferred?: string[];
  hidden?: string[];
  maxColumns?: number;
  emptyText?: string;
  testId?: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!rows || rows.length === 0) return <p className={dash.cardBody}>{emptyText}</p>;

  const allKeys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!allKeys.includes(key) && !hidden.includes(key)) allKeys.push(key);
  const columns = [...preferred.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !preferred.includes(k))].slice(0, maxColumns);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} data-testid={testId}>
        <thead>
          <tr style={{ textAlign: 'left', opacity: 0.6 }}>
            {columns.map((c) => (
              <th key={c} style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }}>{humanizeKey(c)}</th>
            ))}
            <th style={{ padding: '6px 0' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={i}>
              <tr style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)' }}>
                {columns.map((c) => {
                  const text = formatAdminValue(row[c]);
                  return (
                    <td key={c} style={{ padding: '7px 8px 7px 0', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={text}>
                      {text}
                    </td>
                  );
                })}
                <td style={{ padding: '7px 0', whiteSpace: 'nowrap' }}>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 11, opacity: 0.7 }}
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    {expanded === i ? 'Hide' : 'All fields'}
                  </button>
                </td>
              </tr>
              {expanded === i && (
                <tr>
                  <td colSpan={columns.length + 1} style={{ padding: '4px 0 12px' }}>
                    <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.85 }}>{JSON.stringify(row, null, 2)}</pre>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminNotes({ notes }: { notes?: string[] }) {
  if (!notes || notes.length === 0) return null;
  return <p className={dash.cardBody} style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>Not available in this database: {notes.join('; ')}.</p>;
}
