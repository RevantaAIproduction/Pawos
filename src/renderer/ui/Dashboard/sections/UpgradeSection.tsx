import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import {
  SUBSCRIPTION_TIER_ORDER,
  type PricingConfig,
  type PricingPlan,
  type SubscriptionState,
  type SubscriptionTierId,
} from '../../../../shared/billing/BillingTypes';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Paw Go',
  pro: 'Paw Pro',
  proMax: 'Paw Pro Max',
  team: 'Paw Team',
  enterprise: 'Paw Enterprise',
};

function formatPrice(plan: PricingPlan): string {
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}–${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing — ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/mo — ${range}`;
  }
  if (plan.priceCents === null) return 'Pricing coming soon';
  if (plan.priceCents === 0) return 'Free';
  return `$${(plan.priceCents / 100).toFixed(2)}/mo`;
}

/**
 * The dedicated plan-comparison + purchase page — reached only via the
 * profile menu's "Upgrade plan" action or Settings > Billing's "Upgrade"
 * button, never a Settings tab itself. Mirrors pawos-web's own /pricing
 * page (Individual / Team and Enterprise tabs) so the in-app and website
 * pricing presentations stay consistent, but reads live plan/tier data via
 * IPC instead of a static list.
 */
export function UpgradeSection({ onBack }: { onBack: () => void }) {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [tab, setTab] = useState<'individual' | 'team'>('individual');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
  }, []);

  const currentTier = subscription?.tier ?? 'go';
  const currentIndex = SUBSCRIPTION_TIER_ORDER.indexOf(currentTier);

  const startCheckout = async (tier: SubscriptionTierId) => {
    setBusy(true);
    setMessage(null);
    try {
      const callbackUrl = await ipc.billingStartCheckoutSync().catch(() => undefined);
      const result = await ipc.billingCreateCheckoutSession(tier, callbackUrl);
      if (result.ok) {
        await ipc.actionExecute({ type: 'openUrl', url: result.checkoutUrl });
        setMessage('Opened checkout in your browser.');
      } else {
        setMessage(result.reason);
      }
    } finally {
      setBusy(false);
    }
  };

  const individualPlans = (pricing?.plans ?? []).filter((p) => !p.seatBased && p.id !== 'go');
  const teamPlans = (pricing?.plans ?? []).filter((p) => p.seatBased);
  const plans = tab === 'individual' ? individualPlans : teamPlans;

  return (
    <div>
      <button type="button" className={styles.upgradeBackLink} onClick={onBack}>
        ‹ Back to Billing
      </button>

      <div className={styles.upgradeHero}>
        <h2 className={styles.upgradeHeroTitle}>Plans that grow with you</h2>
        <div className={styles.upgradeTabRow}>
          <button
            type="button"
            className={`${styles.chip} ${tab === 'individual' ? styles.chipActive : ''}`}
            onClick={() => setTab('individual')}
          >
            Individual
          </button>
          <button
            type="button"
            className={`${styles.chip} ${tab === 'team' ? styles.chipActive : ''}`}
            onClick={() => setTab('team')}
          >
            Team and Enterprise
          </button>
        </div>
      </div>

      <div className={styles.grid} style={{ marginTop: 28 }}>
        {plans.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isDowngrade = SUBSCRIPTION_TIER_ORDER.indexOf(plan.id) < currentIndex;
          return (
            <div key={plan.id} className={styles.card}>
              <h3 className={styles.cardTitle}>{plan.label}</h3>
              <p className={styles.cardBody} style={{ fontSize: 20, fontWeight: 700, color: '#f5f5f7', marginTop: 6 }}>
                {formatPrice(plan)}
              </p>
              <ul style={{ margin: '14px 0 0', paddingLeft: 18 }}>
                {plan.features.map((f) => (
                  <li key={f} className={styles.cardBody}>
                    {f}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 16 }}>
                {isCurrent ? (
                  <span className={styles.chip}>Current plan</span>
                ) : plan.seatBased ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => ipc.actionExecute({ type: 'openUrl', url: 'https://revantaai.com/contact-sales' })}
                  >
                    Contact sales
                  </button>
                ) : isDowngrade ? (
                  <button type="button" className={styles.chip} disabled>
                    Included in your plan
                  </button>
                ) : (
                  <button type="button" className={styles.primaryButton} disabled={busy} onClick={() => startCheckout(plan.id)}>
                    Get {plan.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {message && <p className={styles.cardBody} style={{ marginTop: 16 }}>{message}</p>}
    </div>
  );
}
