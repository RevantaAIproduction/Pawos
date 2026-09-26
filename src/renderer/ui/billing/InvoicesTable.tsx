import React, { useEffect, useState } from 'react';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../auth/supabaseClient';
import type { BillingInvoice } from '../../../shared/billing/BillingTypes';
import { formatInvoiceAmount, invoiceStatusLabel } from './invoiceFormat';

const headCell: React.CSSProperties = { textAlign: 'left', padding: '8px 16px 8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' };
const cell: React.CSSProperties = { padding: '10px 16px 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' };
const note: React.CSSProperties = { padding: '16px 0', textAlign: 'center', opacity: 0.5, fontSize: '0.9em' };

type LoadState = { kind: 'loading' } | { kind: 'error'; reason: string } | { kind: 'ready'; invoices: BillingInvoice[] };

/** The account's real subscription invoices from Razorpay — date, total, status and a link to each invoice. */
export function InvoicesTable() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (await getSupabaseClient()).auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (!cancelled) setState({ kind: 'ready', invoices: [] });
        return;
      }
      const result = await ipc.billingListInvoices(token);
      if (!cancelled) setState(result.ok ? { kind: 'ready', invoices: result.invoices } : { kind: 'error', reason: result.reason });
    })().catch((error) => {
      if (!cancelled) setState({ kind: 'error', reason: error instanceof Error ? error.message : 'Could not load invoices.' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
        <thead>
          <tr>
            <th style={headCell}>Date</th>
            <th style={headCell}>Total</th>
            <th style={headCell}>Status</th>
            <th style={{ ...headCell, paddingRight: 0 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.kind === 'loading' && (
            <tr><td colSpan={4} style={note}>Loading invoices…</td></tr>
          )}
          {state.kind === 'error' && (
            <tr><td colSpan={4} style={note}>Couldn't load invoices — {state.reason}</td></tr>
          )}
          {state.kind === 'ready' && state.invoices.length === 0 && (
            <tr><td colSpan={4} style={note}>No invoices yet</td></tr>
          )}
          {state.kind === 'ready' && state.invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td style={cell}>{new Date(invoice.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
              <td style={cell}>{formatInvoiceAmount(invoice.amount, invoice.currency)}</td>
              <td style={cell}>{invoiceStatusLabel(invoice.status)}</td>
              <td style={{ ...cell, paddingRight: 0 }}>
                {invoice.url ? (
                  <button
                    type="button"
                    onClick={() => void ipc.actionExecute({ type: 'openUrl', url: invoice.url! })}
                    style={{ background: 'none', border: 'none', padding: 0, color: 'rgb(147, 197, 253)', cursor: 'pointer', fontSize: 'inherit' }}
                  >
                    View
                  </button>
                ) : (
                  <span style={{ opacity: 0.4 }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
