import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../../organization/AutonomousTaskBillingService';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';
import { MIN_TICKET_BALANCE_TOPUP_USD, MAX_TICKET_BALANCE_TOPUP_USD, TICKET_BALANCE_TOPUP_PRESETS_USD, TICKET_PRICING_TIERS, getTicketUnitPriceUsd } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { OrganizationBillingEvent, TicketBalance, TicketBalanceTopup } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { SubscriptionTierId, TicketPricingConfig } from '../../../../shared/billing/BillingTypes';

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

/**
 * Individual-account (non-organization) equivalent of
 * AutonomousTaskBillingCard.tsx — same dollar-denominated Ticket Balance
 * wallet, scoped to the signed-in user's own personal balance
 * (organizationId: null) instead of an organization's. Team/Enterprise
 * members see the org-scoped card inside Organization settings instead;
 * this card is for a Pro/Pro Max individual account.
 */
export function TaskCreditsSection({ user }: { user: AuthUser }) {
  const [tier, setTier] = useState<SubscriptionTierId | null>(null);
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
    maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD,
  });
  const [amountInput, setAmountInput] = useState(String(TICKET_BALANCE_TOPUP_PRESETS_USD[0]));
  const [busy, setBusy] = useState(false);
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);

  function reload() {
    if (user.isGuest) {
      setLoading(false);
      return;
    }
    Promise.all([
      ipc.billingGetSubscription(),
      ipc.billingGetTicketPricingConfig(),
      autonomousTaskBillingService.getTicketBalance(null),
      autonomousTaskBillingService.listTopups(null, 100),
      autonomousTaskBillingService.listBillingHistory(null, 200),
      autonomousTaskBillingService.listRecentRuns(null, 200),
    ])
      .then(([subscription, ticketPricing, ticketBalance, ticketTopups, billingHistory, recentRuns]) => {
        setTier(subscription.tier);
        setPricingConfig(ticketPricing);
        setBalance(ticketBalance);
        setTopups(ticketTopups);
        setEvents(billingHistory);
        setTotalCompleted(recentRuns.filter((r) => r.status === 'completed').length);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [user.isGuest]);

  useEffect(() => {
    if (user.isGuest) return;
    ipc.onTaskCreditsPurchased(() => reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isGuest]);

  async function addFunds() {
    const parsed = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed < pricingConfig.minTopupUsd) {
      setError(`Minimum top-up is $${pricingConfig.minTopupUsd}.`);
      return;
    }
    if (parsed > pricingConfig.maxTopupUsd) {
      setError(`Maximum top-up is $${pricingConfig.maxTopupUsd.toLocaleString()}.`);
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(false);
    setCheckoutIntent({ kind: 'autonomousWorkCredits', amountUsd: parsed, title: 'Autonomous Work Credits' });
  }

  if (user.isGuest) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  if (tier === 'team' || tier === 'enterprise') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Your organization manages one shared Ticket Balance for every member — go to{' '}
          <strong>Organization → Credits &amp; Billing</strong> to view or add funds, rather than a
          separate personal balance here.
        </p>
      </div>
    );
  }

  if (tier !== 'pro' && tier !== 'proMax') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System — Pricing</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Available on every paid plan (Pro and above) — upgrade to add funds to a Ticket Balance and let Paw ship
          real code changes end to end. Funds are only ever deducted once a ticket investigation reaches successful
          completion, at the volume-tiered rate below.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {TICKET_PRICING_TIERS.map((t) => (
            <div
              key={t.minTicketNumber}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span>
                {t.maxTicketNumber === null
                  ? `Ticket ${t.minTicketNumber.toLocaleString()}+`
                  : `Tickets ${t.minTicketNumber.toLocaleString()}–${t.maxTicketNumber.toLocaleString()}`}
              </span>
              <span style={{ fontWeight: 600 }}>${t.pricePerTicketUsd.toFixed(2)}/ticket</span>
            </div>
          ))}
        </div>
        <p className={styles.cardBody} style={{ fontSize: 11.5, marginTop: 10 }}>
          Minimum top-up ${MIN_TICKET_BALANCE_TOPUP_USD} once you're on a Pro plan or above.
        </p>
      </div>
    );
  }

  const monthToDate = autonomousTaskBillingService.monthToDateTotal(events);
  const balanceUsd = balance?.balanceUsd ?? 0;
  const ticketsUsedCount = balance?.ticketsUsedCount ?? 0;
  const nextTicketPrice = getTicketUnitPriceUsd(ticketsUsedCount + 1);

  return (
    <>
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Top up any dollar amount into a Ticket Balance — never for chat, research, meetings,
        documents, browser automation, or manual coding help. Funds are deducted only once a ticket
        investigation reaches successful completion, at the current volume-tiered rate for your
        account (currently ${nextTicketPrice.toFixed(2)}/ticket). Available for tickets from Jira,
        Linear, and GitHub Issues.
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
          max={pricingConfig.maxTopupUsd}
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

      <div style={{ marginTop: 14, marginBottom: 6 }}>
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

      <div style={{ marginBottom: 6 }}>
        <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Ticket usage history</p>
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
    {checkoutIntent && (
      <NativeBillingCheckoutModal
        intent={checkoutIntent}
        onClose={() => setCheckoutIntent(null)}
        onSuccess={() => {
          setCheckoutIntent(null);
          setMessage('Payment verified. Your Ticket Balance has been updated.');
          reload();
        }}
      />
    )}
    </>
  );
}
