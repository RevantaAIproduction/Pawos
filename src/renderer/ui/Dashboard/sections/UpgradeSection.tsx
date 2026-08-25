import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { OrganizationIcon, SecurityIcon } from '../NavIcons';
import {
  SUBSCRIPTION_TIER_ORDER,
  type PricingConfig,
  type PricingPlan,
  type SeatTier,
  type SubscriptionState,
  type SubscriptionTierId,
} from '../../../../shared/billing/BillingTypes';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Go',
  pro: 'Pro',
  proMax: 'Pro Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

/** Only Team/Enterprise get a plan icon here — matches how the reference layout distinguishes the
 *  two organization-scale plans from the flat individual ones. */
const PLAN_ICONS: Partial<Record<SubscriptionTierId, () => React.JSX.Element>> = {
  team: OrganizationIcon,
  enterprise: SecurityIcon,
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
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);
  useEffect(() => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
  }, []);

  const currentTier = subscription?.tier ?? 'go';
  const currentIndex = SUBSCRIPTION_TIER_ORDER.indexOf(currentTier);

  const startCheckout = (tier: SubscriptionTierId, seatTier?: SeatTier, seatCount?: number) => {
    setMessage(null);
    setCheckoutIntent({ kind: 'subscription', tier: tier as Exclude<SubscriptionTierId, 'go'>, seatTier, seatCount });
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

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 20,
          marginTop: 28,
        }}
      >
        {plans.map((plan) => {
          const isCurrent = plan.id === currentTier;
          const isDowngrade = SUBSCRIPTION_TIER_ORDER.indexOf(plan.id) < currentIndex;
          const Icon = PLAN_ICONS[plan.id];
          return (
            <div key={plan.id} className={styles.card} style={{ width: 300, flex: '0 0 auto' }}>
              {Icon && (
                <div style={{ opacity: 0.75, marginBottom: 8 }}>
                  <Icon />
                </div>
              )}
              <h3 className={styles.cardTitle}>{plan.label}</h3>
              {plan.tagline && (
                <p className={styles.cardBody} style={{ fontSize: 12.5, marginTop: 2 }}>{plan.tagline}</p>
              )}

              {plan.seatOptions ? (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plan.seatOptions.map((seat) => (
                    <div
                      key={seat.seatTier}
                      style={{ borderRadius: 10, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', padding: '8px 10px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{seat.label}</span>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>
                          {seat.priceCents === null ? 'Custom' : `$${(seat.priceCents / 100).toFixed(0)}/seat/mo`}
                        </span>
                      </div>
                      <p className={styles.cardBody} style={{ fontSize: 11.5, marginTop: 2 }}>{seat.description}</p>
                      {!isCurrent && !isDowngrade && (
                        <button
                          type="button"
                          className={styles.primaryButton}
                          style={{ marginTop: 8, width: '100%' }}
                          onClick={() => startCheckout(plan.id, seat.seatTier, undefined)}
                        >
                          {plan.id === 'enterprise' ? 'Configure Enterprise' : `Get ${seat.label}`}
                        </button>
                      )}
                    </div>
                  ))}
                  <p className={styles.cardBody} style={{ fontSize: 11.5 }}>
                    {plan.minSeats}–{plan.maxSeats} members · mix seat types freely across your organization
                  </p>
                </div>
              ) : plan.usageBilling ? (
                <div
                  style={{
                    marginTop: 10,
                    borderRadius: 10,
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
                    padding: '8px 10px',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{plan.usageBilling.label}</span>
                  <p className={styles.cardBody} style={{ fontSize: 11.5, marginTop: 2 }}>
                    {plan.priceCents === null
                      ? 'Configuration required'
                      : `$${(plan.priceCents / 100).toFixed(2)}/seat/mo — starts at ${plan.minSeats ?? 20} members`}
                  </p>
                  <p className={styles.cardBody} style={{ fontSize: 11.5, marginTop: 2 }}>{plan.usageBilling.description}</p>
                </div>
              ) : (
                <p className={styles.cardBody} style={{ fontSize: 20, fontWeight: 700, color: '#f5f5f7', marginTop: 6 }}>
                  {formatPrice(plan)}
                </p>
              )}

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
                ) : isDowngrade ? (
                  <button type="button" className={styles.chip} disabled>
                    Included in your plan
                  </button>
                ) : plan.seatOptions ? null : (
                  <button type="button" className={styles.primaryButton} onClick={() => startCheckout(plan.id, undefined, undefined)}>
                    Get {plan.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {message && <p className={styles.cardBody} style={{ marginTop: 16, textAlign: 'center' }}>{message}</p>}
      {checkoutIntent && (
        <NativeBillingCheckoutModal
          intent={checkoutIntent}
          onClose={() => setCheckoutIntent(null)}
          onSuccess={() => {
            setMessage('Payment verified. Your plan will refresh automatically.');
            ipc.billingGetSubscription().then(setSubscription).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
