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
    return null;
  }

  const balanceUsd = balance?.balanceUsd ?? 0;

  if (tier !== 'pro' && tier !== 'proMax') {
    return null;
  }

  return (
    <>
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: 0 }}>Autonomous Ticket Credit</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Current balance: ${balanceUsd.toFixed(2)}</p>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: tier === 'proMax' ? '#404040' : '#606060', color: '#fff', border: 'none', borderRadius: 4, cursor: tier === 'proMax' ? 'pointer' : 'not-allowed', fontSize: '0.9em', fontWeight: 500, whiteSpace: 'nowrap', opacity: tier === 'proMax' ? 1 : 0.5 }} disabled={tier !== 'proMax'} onClick={addFunds}>
          {busy ? 'Opening checkout…' : 'Buy credit'}
        </button>
      </div>
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
