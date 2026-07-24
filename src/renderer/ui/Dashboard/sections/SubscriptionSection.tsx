import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { PAW_MODEL_CATALOG } from '../../../../shared/ai/PawModelTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import {
  SUBSCRIPTION_TIER_ORDER,
  type PricingConfig,
  type PricingPlan,
  type SubscriptionState,
  type SubscriptionTierId,
  type EntitlementSnapshot,
} from '../../../../shared/billing/BillingTypes';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Paw Go',
  pro: 'Paw Pro',
  proMax: 'Paw Pro Max',
  team: 'Paw Team',
  enterprise: 'Paw Enterprise',
};

function formatPrice(plan: PricingPlan | undefined): string {
  if (!plan) return '…';
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}–${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing — ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/${plan.billingPeriod} — ${range}`;
  }
  if (plan.priceCents === null) return 'Pricing not finalized yet';
  if (plan.priceCents === 0) return 'Free';
  return `$${(plan.priceCents / 100).toFixed(2)}/${plan.billingPeriod}`;
}

/**
 * The Subscription/Billing page — Current Plan, Plan Features, Available
 * Models, Credits Remaining, Upgrade/Downgrade. Every plan/model/feature/
 * credit value here comes from PricingConfigStore / SubscriptionStore /
 * EntitlementService via IPC — nothing is hard-coded, matching "no runtime
 * should contain hard-coded plan checks; query the entitlement service."
 * Guests never see real plan/billing data — they haven't created an
 * account, so there's nothing real to show; see the isGuest branch below.
 */
export function SubscriptionSection({
  user,
  onGoToAccount,
  onUpgrade,
}: {
  user: AuthUser;
  onGoToAccount: () => void;
  /** Navigates to the dedicated plan-comparison + checkout page. */
  onUpgrade: () => void;
}) {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  };

  useEffect(() => {
    if (user.isGuest) return;
    refresh();
    // Website checkout runs in the system browser, outside this app — there's
    // no shared account/subscription backend yet for a real push-based sync
    // (see RazorpayBillingProvider.ts), so refreshing on window focus is the
    // honest mechanism available today: coming back from checkout re-checks
    // the plan automatically without the user needing to reopen this page.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    // The real push: CheckoutSyncServer.ts fires this the moment a payment
    // actually completes, via a local loopback callback the checkout page
    // pings — see UpgradeSection.tsx's startCheckout for where that callback
    // URL comes from (checkout itself now happens on the dedicated page).
    ipc.onSubscriptionUpdated(() => {
      refresh();
      setMessage('Payment confirmed — your plan has been updated.');
    });

    return () => window.removeEventListener('focus', onFocus);
  }, [user.isGuest]);

  const downgrade = async (tier: SubscriptionTierId) => {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.billingSetSubscriptionTier(tier);
      refresh();
      setMessage(`Switched to ${TIER_LABELS[tier]}.`);
    } finally {
      setBusy(false);
    }
  };

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No plan yet — you're previewing PawOS as a guest</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Guest sessions are sample access only — no subscription, billing, or usage tracking
          applies. Create a free account to start on <strong>Paw Go</strong> (completely free),
          then upgrade to Pro, Pro Max, Team, or Enterprise whenever you're ready.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} onClick={onGoToAccount}>
          Create free account
        </button>
      </div>
    );
  }

  const currentTier = subscription?.tier ?? 'go';
  const currentPlan = pricing?.plans.find((p) => p.id === currentTier);
  const currentIndex = SUBSCRIPTION_TIER_ORDER.indexOf(currentTier);
  const nextTier = SUBSCRIPTION_TIER_ORDER[currentIndex + 1];
  const previousTier = currentIndex > 0 ? SUBSCRIPTION_TIER_ORDER[currentIndex - 1] : undefined;

  return (
    <div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Current Plan</h3>
          <p className={styles.cardBody}>
            {currentPlan ? currentPlan.label : '…'}
            {currentPlan && ` — ${formatPrice(currentPlan)}`}
          </p>
          <p className={styles.cardBody} style={{ marginTop: 4 }}>
            Billing status: {subscription?.status ?? '…'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {nextTier && (
              <button type="button" className={styles.primaryButton} onClick={onUpgrade}>
                Upgrade plan
              </button>
            )}
            {previousTier && (
              <button type="button" className={styles.chip} onClick={() => downgrade(previousTier)} disabled={busy}>
                Downgrade to {TIER_LABELS[previousTier]}
              </button>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Credits Remaining</h3>
          <p className={styles.cardBody}>
            {entitlement ? `${entitlement.creditsUsedThisPeriod} used this period` : '…'}
            {entitlement && (entitlement.creditLimit === null ? ' — no cap configured yet' : ` / ${entitlement.creditLimit}`)}
          </p>
          <p className={styles.cardBody} style={{ marginTop: 4 }}>
            {entitlement?.models.length === 0
              ? 'No AI credits on Paw Go.'
              : entitlement?.hasCreditsRemaining === false
                ? 'Credits exhausted for this period.'
                : 'AI credits available.'}
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Plan Features</h3>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {(currentPlan?.features ?? []).map((f) => (
            <li key={f} className={styles.cardBody}>
              {f}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Available Models</h3>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {PAW_MODEL_CATALOG.map((m) => {
            const available = entitlement?.models.includes(m.id) ?? false;
            return (
              <span key={m.id} className={styles.chip} style={{ opacity: available ? 1 : 0.45 }} title={m.description}>
                {m.label}
                {m.status === 'comingSoon' ? ' (soon)' : available ? '' : ' (locked)'}
              </span>
            );
          })}
        </div>
      </div>

      {message && <p className={styles.cardBody} style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}
