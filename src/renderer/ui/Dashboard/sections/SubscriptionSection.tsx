import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';
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

export function SubscriptionSection({
  user,
  onGoToAccount,
  onUpgrade,
}: {
  user: AuthUser;
  onGoToAccount: () => void;
  onUpgrade: () => void;
}) {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAutoReloadModal, setShowAutoReloadModal] = useState(false);
  const [autoReloadAmount, setAutoReloadAmount] = useState('10');
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [showCreditsAmountModal, setShowCreditsAmountModal] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState('10');
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);

  const refresh = () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  };

  useEffect(() => {
    if (user.isGuest) return;
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

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
  const renewalDate = subscription?.renewsAt ? new Date(subscription.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const billingPeriod = currentPlan?.billingPeriod === 'month' ? 'Monthly' : currentPlan?.billingPeriod === 'year' ? 'Yearly' : 'N/A';

  return (
    <>
    <div>
      {/* Current plan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h2 style={{ fontSize: '1.4em', fontWeight: 700, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>{currentPlan?.label ?? '…'}</h2>
          <p style={{ margin: '0 0 4px 0', fontSize: '0.9em', opacity: 0.7 }}>{billingPeriod}</p>
          <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.6 }}>Your subscription will auto renew on {renewalDate}.</p>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={onUpgrade}>
          Adjust plan
        </button>
      </div>

      {/* Payment methods */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, backgroundColor: 'rgba(25, 103, 210, 0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1em', color: '#1967D2' }}>💳</div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9em', fontWeight: 500 }}>Payment method not configured</p>
          </div>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setMessage('Payment method management coming soon. Use checkout to add a card.')}>
          Update
        </button>
      </div>

      {/* Usage credits */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Usage credits</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.85em', opacity: 0.65, lineHeight: 1.5 }}>
          Buy usage credits so your team can keep using Claude when they hit a plan limit. Your monthly spend limit still applies.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ margin: 0, fontSize: '1.6em', fontWeight: 700, letterSpacing: '-0.5px' }}>$0.00</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Current balance</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsAmountModal(true)}>
              Buy usage credits
            </button>
            <span style={{ fontSize: '0.75em', backgroundColor: '#1967D2', color: 'white', padding: '4px 10px', borderRadius: 3, whiteSpace: 'nowrap', fontWeight: 600 }}>
              Up to 30% off
            </span>
          </div>
        </div>
      </div>

      {/* Auto-reload */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: 0 }}>Auto-reload</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Automatically buy more usage credits when you run out</p>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500, whiteSpace: 'nowrap' }} onClick={() => autoReloadEnabled ? setAutoReloadEnabled(false) : setShowAutoReloadModal(true)}>
          {autoReloadEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      {/* Usage Credits Amount Modal */}
      {showCreditsAmountModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Buy usage credits</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Enter the amount of usage credits you want to purchase ($5 - $20,000).
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount (USD)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
                <input
                  type="number"
                  min="5"
                  max="20000"
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsAmountModal(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                const amount = parseFloat(creditsAmount);
                if (Number.isFinite(amount) && amount >= 5 && amount <= 20000) {
                  setCheckoutIntent({ kind: 'usageCredits', amountUsd: amount, title: 'Buy Usage Credits' });
                  setShowCreditsAmountModal(false);
                } else {
                  setMessage('Please enter a valid amount between $5 and $20,000.');
                }
              }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-reload Modal */}
      {showAutoReloadModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Set auto-reload amount</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              When your usage credits run out, PawOS will automatically purchase this amount to keep you going.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount to auto-purchase</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  value={autoReloadAmount}
                  onChange={(e) => setAutoReloadAmount(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowAutoReloadModal(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                setAutoReloadEnabled(true);
                setMessage(`Auto-reload enabled: $${autoReloadAmount} will be charged when credits run out`);
                setShowAutoReloadModal(false);
              }}>
                Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Invoices</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 16px 8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Total</th>
                <th style={{ textAlign: 'left', padding: '8px 16px 8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancellation */}
      <div style={{ paddingBottom: 0 }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Cancellation</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.85em', opacity: 0.6, lineHeight: 1.5 }}>
          Cancel plan
        </p>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
          if (confirm('Are you sure you want to cancel your subscription? You will lose access to all paid features.')) {
            downgrade('go');
          }
        }}>
          Cancel
        </button>
      </div>

      {message && <p style={{ margin: '16px 0 0 0', opacity: 0.8, fontSize: '0.9em', color: '#4cb050' }}>{message}</p>}
    </div>

    {checkoutIntent && <NativeBillingCheckoutModal intent={checkoutIntent} onClose={() => setCheckoutIntent(null)} />}
    </>
  );
}
