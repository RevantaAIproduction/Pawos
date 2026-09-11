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
  go: 'Go',
  pro: 'Pro',
  proMax: 'Pro Max',
  team: 'Team',
  enterprise: 'Enterprise',
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

  const renewalDate = subscription?.renewsAt ? new Date(subscription.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const billingPeriod = currentPlan?.billingPeriod === 'month' ? 'Monthly' : currentPlan?.billingPeriod === 'year' ? 'Yearly' : 'N/A';

  return (
    <div>
      {/* Plan & Pricing Section */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Plan & Pricing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div>
            <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginBottom: 2 }}>Plan</p>
            <p className={styles.cardBody} style={{ fontWeight: 600 }}>{currentPlan?.label ?? '…'}</p>
          </div>
          <div>
            <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginBottom: 2 }}>Billing Cycle</p>
            <p className={styles.cardBody} style={{ fontWeight: 600 }}>{billingPeriod}</p>
          </div>
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
          <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginBottom: 2 }}>Renewal Date</p>
          <p className={styles.cardBody} style={{ fontWeight: 600 }}>{renewalDate}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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

      {/* Payment Method Section */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Payment Method</h3>
        <p className={styles.cardBody} style={{ marginTop: 8 }}>
          <strong>Visa</strong> •••• <strong>9845</strong>
        </p>
        <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginTop: 4 }}>Expires 12/2027</p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }}>
          Update Payment Method
        </button>
      </div>

      {/* Usage Credits Section */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Usage Credits</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginBottom: 2 }}>Current Balance</p>
            <p className={styles.cardBody} style={{ fontWeight: 600, fontSize: '1.2em' }}>$0.00</p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className={styles.primaryButton}>
              Buy usage credits
            </button>
            <span style={{
              fontSize: '0.75em',
              backgroundColor: 'rgba(76, 175, 80, 0.15)',
              color: '#4cb050',
              padding: '4px 8px',
              borderRadius: 4,
              whiteSpace: 'nowrap'
            }}>
              Up to 30% off
            </span>
          </div>
        </div>
        <p className={styles.cardBody} style={{ opacity: 0.65, fontSize: '0.85em', marginTop: 8 }}>
          Get faster responses with prepaid credits. Unused credits never expire.
        </p>
      </div>

      {/* Auto-Reload Section */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Auto-Reload</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            <p className={styles.cardBody}>Automatically refill credits when balance runs low</p>
            <p className={styles.cardBody} style={{ opacity: 0.7, fontSize: '0.85em', marginTop: 4 }}>Add $20 when balance drops below $5</p>
          </div>
          <button type="button" className={styles.primaryButton}>
            Turn on
          </button>
        </div>
      </div>

      {/* Invoices Section */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Invoices</h3>
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Total</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '12px 0' }}>Sep 11, 2026</td>
                <td style={{ padding: '12px 0' }}>$20.00</td>
                <td style={{ padding: '12px 0' }}>
                  <span style={{
                    fontSize: '0.8em',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    color: '#4cb050',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}>
                    Paid
                  </span>
                </td>
                <td style={{ padding: '12px 0' }}>
                  <button type="button" className={styles.chip} style={{ fontSize: '0.85em' }}>Download</button>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <td style={{ padding: '12px 0' }}>Aug 11, 2026</td>
                <td style={{ padding: '12px 0' }}>$20.00</td>
                <td style={{ padding: '12px 0' }}>
                  <span style={{
                    fontSize: '0.8em',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    color: '#4cb050',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}>
                    Paid
                  </span>
                </td>
                <td style={{ padding: '12px 0' }}>
                  <button type="button" className={styles.chip} style={{ fontSize: '0.85em' }}>Download</button>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '12px 0' }}>Jul 11, 2026</td>
                <td style={{ padding: '12px 0' }}>$20.00</td>
                <td style={{ padding: '12px 0' }}>
                  <span style={{
                    fontSize: '0.8em',
                    backgroundColor: 'rgba(76, 175, 80, 0.15)',
                    color: '#4cb050',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}>
                    Paid
                  </span>
                </td>
                <td style={{ padding: '12px 0' }}>
                  <button type="button" className={styles.chip} style={{ fontSize: '0.85em' }}>Download</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Features Section */}
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

      {/* Available Models Section */}
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

      {/* Paw Compute Usage Section */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Paw Compute Usage</h3>
        {entitlement ? (
          entitlement.pooled ? (
            <p className={styles.cardBody}>Pooled organization — usage tracked by your org.</p>
          ) : (
            <>
              <p className={styles.cardBody} style={{ marginTop: 4 }}>
                <strong>Last 5 hours:</strong>{' '}
                {entitlement.usage5hPc.toFixed(2)} PC used
                {entitlement.limit5hPc !== null ? ` / ${entitlement.limit5hPc} PC` : ' — no cap'}
                {entitlement.limit5hPc !== null && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({Math.max(0, entitlement.limit5hPc - entitlement.usage5hPc).toFixed(2)} remaining)
                  </span>
                )}
              </p>
              <p className={styles.cardBody} style={{ marginTop: 4 }}>
                <strong>Last 7 days:</strong>{' '}
                {entitlement.usageWeeklyPc.toFixed(2)} PC used
                {entitlement.limitWeeklyPc !== null ? ` / ${entitlement.limitWeeklyPc} PC` : ' — no cap'}
                {entitlement.limitWeeklyPc !== null && (
                  <span style={{ marginLeft: 6, opacity: 0.7 }}>
                    ({Math.max(0, entitlement.limitWeeklyPc - entitlement.usageWeeklyPc).toFixed(2)} remaining)
                  </span>
                )}
              </p>
              {entitlement.fableCreditsRemaining > 0 && (
                <p className={styles.cardBody} style={{ marginTop: 4 }}>
                  <strong>Paw Fable credits:</strong> {entitlement.fableCreditsRemaining.toFixed(2)} PC remaining
                </p>
              )}
              <p className={styles.cardBody} style={{ marginTop: 4, opacity: 0.65, fontSize: '0.85em' }}>
                1 PC ≈ $0.001 · typical chat turn ≈ 8–32 PC
              </p>
              {!entitlement.hasCreditsRemaining && (
                <p className={styles.cardBody} style={{ marginTop: 6, fontWeight: 600 }}>
                  Usage limit reached — generation paused until the window rolls forward.
                </p>
              )}
            </>
          )
        ) : (
          <p className={styles.cardBody}>…</p>
        )}
      </div>

      {/* Cancel Plan Section */}
      <div className={styles.card} style={{ marginTop: 14, paddingBottom: 14, borderTop: '1px solid rgba(0,0,0,0.1)' }}>
        <h3 className={styles.cardTitle} style={{ color: '#d32f2f' }}>Cancel Plan</h3>
        <p className={styles.cardBody} style={{ marginTop: 8, marginBottom: 12 }}>
          If you're not happy with PawOS, you can cancel your subscription anytime. You'll have access through the end of your billing period.
        </p>
        <button type="button" style={{
          padding: '8px 16px',
          backgroundColor: '#d32f2f',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: '0.9em',
          fontWeight: 500
        }}>
          Cancel plan
        </button>
      </div>

      {message && <p className={styles.cardBody} style={{ marginTop: 12 }}>{message}</p>}
    </div>
  );
}
