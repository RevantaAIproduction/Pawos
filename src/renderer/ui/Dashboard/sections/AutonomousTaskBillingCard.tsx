import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../../organization/AutonomousTaskBillingService';
import { MIN_TICKET_BALANCE_TOPUP_USD, TICKET_BALANCE_TOPUP_PRESETS_USD, getTicketUnitPriceUsd } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { OrganizationBillingEvent, TicketBalance, TicketBalanceTopup } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { TicketPricingConfig } from '../../../../shared/billing/BillingTypes';

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
  width: 90,
};

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(events: OrganizationBillingEvent[]): string {
  const header = ['created_at', 'ticket_id', 'runtime_version', 'started_at', 'completed_at', 'duration_seconds', 'status', 'amount_usd', 'invoice_reference', 'completion_source'].map(csvField).join(',');
  const rows = events.map((e) =>
    [e.createdAt, e.ticketId ?? '', e.runtimeVersion, e.startedAt, e.completedAt, String(e.durationSeconds), e.status, e.amountUsd.toFixed(2), e.invoiceReference ?? '', e.completionSource]
      .map((v) => csvField(String(v)))
      .join(',')
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
 * Autonomous Ticket System billing dashboard — a dollar-denominated Ticket
 * Balance wallet, completely independent of subscription pricing. Shows the
 * real balance (user_task_credits/organization_task_credits), a top-up flow
 * that opens the real pawos-web Razorpay Orders checkout, the top-up
 * ledger, and the completed-ticket billing history. "Invoice download"
 * here is an honest CSV export of the real rows rather than a fabricated
 * PDF invoice generator.
 */
export function AutonomousTaskBillingCard({ organizationId }: { organizationId: string }) {
  const [balance, setBalance] = useState<TicketBalance | null>(null);
  const [topups, setTopups] = useState<TicketBalanceTopup[]>([]);
  const [events, setEvents] = useState<OrganizationBillingEvent[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Seeded from the shared code defaults, then replaced by the real, editable config the moment
  // it loads — see TicketPricingConfigStore.ts for why the presets/minimum aren't hardcoded here.
  const [pricingConfig, setPricingConfig] = useState<TicketPricingConfig>({
    topupPresetsUsd: [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD,
  });
  const [amountInput, setAmountInput] = useState(String(TICKET_BALANCE_TOPUP_PRESETS_USD[0]));
  const [busy, setBusy] = useState(false);

  function reload() {
    Promise.all([
      ipc.billingGetTicketPricingConfig(),
      autonomousTaskBillingService.getTicketBalance(organizationId),
      autonomousTaskBillingService.listTopups(organizationId, 100),
      autonomousTaskBillingService.listBillingHistory(organizationId, 200),
      autonomousTaskBillingService.listRecentRuns(organizationId, 200),
    ])
      .then(([ticketPricing, ticketBalance, ticketTopups, billingHistory, recentRuns]) => {
        setPricingConfig(ticketPricing);
        setBalance(ticketBalance);
        setTopups(ticketTopups);
        setEvents(billingHistory);
        setTotalCompleted(recentRuns.filter((r) => r.status === 'completed').length);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [organizationId]);

  useEffect(() => {
    ipc.onTaskCreditsPurchased(() => reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function addFunds() {
    const parsed = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed < pricingConfig.minTopupUsd) {
      setError(`Minimum top-up is $${pricingConfig.minTopupUsd}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const callbackUrl = await ipc.billingStartCheckoutSync().catch(() => undefined);
      const result = await ipc.billingCreateCreditsCheckoutSession(parsed, organizationId, callbackUrl);
      if (result.ok) {
        await ipc.actionExecute({ type: 'openUrl', url: result.checkoutUrl });
        setMessage('Opened checkout in your browser. Your balance updates automatically once payment completes.');
      } else {
        setError(result.reason);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  const monthToDate = autonomousTaskBillingService.monthToDateTotal(events);
  const balanceUsd = balance?.balanceUsd ?? 0;
  const ticketsUsedCount = balance?.ticketsUsedCount ?? 0;
  const nextTicketPrice = getTicketUnitPriceUsd(ticketsUsedCount + 1);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Top up any dollar amount into a Ticket Balance — never for chat, research, meetings,
        documents, browser automation, or manual coding help. Funds are deducted only once a ticket
        investigation reaches successful completion, at the current volume-tiered rate for this
        organization (currently ${nextTicketPrice.toFixed(2)}/ticket); a ticket that fails, is
        cancelled, hits its retry limit, or is denied approval never consumes balance.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Ticket balance</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>${balanceUsd.toFixed(2)}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Total completed</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{totalCompleted}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Spend this month</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>${monthToDate.toFixed(2)}</p>
        </div>
      </div>

      {balanceUsd < nextTicketPrice && (
        <p style={{ color: '#e0c28c', fontSize: 12.5, marginBottom: 10 }}>
          Balance can&apos;t cover the next ticket at the current rate (${nextTicketPrice.toFixed(2)}) — add funds below before
          starting a new Autonomous Ticket investigation.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {pricingConfig.topupPresetsUsd.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setAmountInput(String(n))}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              background: amountInput === String(n) ? 'rgba(124,156,255,0.15)' : 'rgba(255,255,255,0.04)',
              border: amountInput === String(n) ? '1px solid #7c9cff' : '1px solid rgba(255,255,255,0.12)',
              color: amountInput === String(n) ? '#cdd8ff' : '#e8e8ec',
            }}
          >
            ${n}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#96969e' }}>$</span>
        <input
          style={inputStyle}
          type="number"
          min={pricingConfig.minTopupUsd}
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
        />
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={addFunds}>
          {busy ? 'Opening checkout…' : 'Add funds'}
        </button>
        <span style={{ fontSize: 12, color: '#96969e' }}>
          Minimum ${pricingConfig.minTopupUsd}
        </span>
      </div>
      {message && <p style={{ color: '#8ce0a8', fontSize: 12.5, marginBottom: 10 }}>{message}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: 14 }}>
        <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Top-up history</p>
      </div>
      {topups.length === 0 ? (
        <p className={styles.cardBody}>No top-ups yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', marginBottom: 14 }}>
          {topups.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>${t.amountUsd.toFixed(2)}</span>
              <span style={{ color: '#96969e' }}>{new Date(t.toppedUpAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Ticket usage history</p>
        <button type="button" disabled={events.length === 0} onClick={() => downloadCsv(`autonomous-task-billing-${organizationId}.csv`, toCsv(events))}>
          Export CSV
        </button>
      </div>
      {events.length === 0 ? (
        <p className={styles.cardBody}>No completed tickets yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>
                {e.ticketId ?? '(no ticket)'} · {Math.round(e.durationSeconds / 60)}m
                {e.completionSource === 'connector_verified' && (
                  <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: 'rgba(140,224,168,0.15)', color: '#8ce0a8' }}>
                    Verified
                  </span>
                )}
              </span>
              <span>${e.amountUsd.toFixed(2)}</span>
              <span style={{ color: '#96969e' }}>{new Date(e.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
