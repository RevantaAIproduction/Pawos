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

const greyButton = {
  padding: '8px 16px',
  backgroundColor: '#505050',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.9em',
  fontWeight: 500
};

const redButton = {
  padding: '8px 16px',
  backgroundColor: '#d32f2f',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: '0.9em',
  fontWeight: 500
};

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
      <div style={{ padding: '16px', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 8 }}>
        <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '0 0 8px 0' }}>No plan yet — you're previewing PawOS as a guest</h3>
        <p style={{ margin: '8px 0', opacity: 0.7, fontSize: '0.9em', lineHeight: 1.5 }}>
          Guest sessions are sample access only — no subscription, billing, or usage tracking applies. Create a free account to start on <strong>Paw Go</strong> (completely free), then upgrade to Pro, Pro Max, Team, or Enterprise whenever you're ready.
        </p>
        <button type="button" style={{ ...greyButton, marginTop: 12 }} onClick={onGoToAccount}>
          Create free account
        </button>
      </div>
    );
  }

  const currentTier = subscription?.tier ?? 'go';
  const currentPlan = pricing?.plans.find((p) => p.id === currentTier);
  const renewalDate = subscription?.renewsAt ? new Date(subscription.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const billingPeriod = currentPlan?.billingPeriod === 'month' ? 'Monthly' : currentPlan?.billingPeriod === 'year' ? 'Yearly' : 'N/A';
  const isProMax = currentTier === 'proMax';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Plan Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <h2 style={{ fontSize: '1.3em', fontWeight: 600, margin: '0 0 4px 0' }}>{currentPlan?.label ?? '…'}</h2>
          <p style={{ margin: '0 0 6px 0', opacity: 0.7, fontSize: '0.9em' }}>{billingPeriod}</p>
          <p style={{ margin: 0, opacity: 0.65, fontSize: '0.85em' }}>Your subscription will auto renew on {renewalDate}.</p>
        </div>
        <button type="button" style={greyButton}>
          Adjust plan
        </button>
      </div>

      {/* Payment Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, backgroundColor: 'rgba(25, 103, 210, 0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2em' }}>💳</div>
          <div>
            <h3 style={{ fontSize: '0.95em', fontWeight: 600, margin: 0 }}>Payment</h3>
            <p style={{ margin: '4px 0 0 0', opacity: 0.7, fontSize: '0.85em' }}>Visa •••• 9845</p>
          </div>
        </div>
        <button type="button" style={greyButton}>
          Update
        </button>
      </div>

      {/* Usage Credits Section - Pro Max Only */}
      {isProMax && (
        <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Usage credits</h3>
          <p style={{ margin: '0 0 12px 0', opacity: 0.7, fontSize: '0.85em', lineHeight: 1.5 }}>
            Buy usage credits so your team can keep using Claude when they hit a plan limit. Your monthly spend limit still applies.
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: '1.4em', fontWeight: 600 }}>$0.00</p>
              <p style={{ margin: '4px 0 0 0', opacity: 0.7, fontSize: '0.85em' }}>Current balance</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" style={greyButton}>
                Buy usage credits
              </button>
              <span style={{
                fontSize: '0.8em',
                backgroundColor: '#1967D2',
                color: 'white',
                padding: '4px 8px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                fontWeight: 500
              }}>
                Up to 30% off
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Auto-reload Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 4px 0' }}>Auto-reload</h3>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.85em' }}>Automatically buy more usage credits when you're running low</p>
        </div>
        <button type="button" style={greyButton}>
          Turn on
        </button>
      </div>

      {/* Invoices Section */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 12px 0' }}>Invoices</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Total</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.7 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Features Section */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 12px 0' }}>Plan Features</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {(currentPlan?.features ?? []).map((f) => (
            <li key={f} style={{ margin: '6px 0', opacity: 0.8, fontSize: '0.9em' }}>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Available Models Section */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 12px 0' }}>Available Models</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PAW_MODEL_CATALOG.map((m) => {
            const available = entitlement?.models.includes(m.id) ?? false;
            return (
              <span key={m.id} style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                borderRadius: 4,
                fontSize: '0.85em',
                opacity: available ? 1 : 0.45
              }} title={m.description}>
                {m.label}
                {m.status === 'comingSoon' ? ' (soon)' : available ? '' : ' (locked)'}
              </span>
            );
          })}
        </div>
      </div>

      {/* Paw Compute Usage Section */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 12px 0' }}>Paw Compute Usage</h3>
        {entitlement ? (
          entitlement.pooled ? (
            <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9em' }}>Pooled organization — usage tracked by your org.</p>
          ) : (
            <>
              <p style={{ margin: '0 0 8px 0', opacity: 0.8, fontSize: '0.9em' }}>
                <strong>Last 5 hours:</strong> {entitlement.usage5hPc.toFixed(2)} PC used
                {entitlement.limit5hPc !== null ? ` / ${entitlement.limit5hPc} PC` : ' — no cap'}
                {entitlement.limit5hPc !== null && (
                  <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '0.85em' }}>
                    ({Math.max(0, entitlement.limit5hPc - entitlement.usage5hPc).toFixed(2)} remaining)
                  </span>
                )}
              </p>
              <p style={{ margin: '0 0 8px 0', opacity: 0.8, fontSize: '0.9em' }}>
                <strong>Last 7 days:</strong> {entitlement.usageWeeklyPc.toFixed(2)} PC used
                {entitlement.limitWeeklyPc !== null ? ` / ${entitlement.limitWeeklyPc} PC` : ' — no cap'}
                {entitlement.limitWeeklyPc !== null && (
                  <span style={{ marginLeft: 6, opacity: 0.6, fontSize: '0.85em' }}>
                    ({Math.max(0, entitlement.limitWeeklyPc - entitlement.usageWeeklyPc).toFixed(2)} remaining)
                  </span>
                )}
              </p>
              {entitlement.fableCreditsRemaining > 0 && (
                <p style={{ margin: '0 0 8px 0', opacity: 0.8, fontSize: '0.9em' }}>
                  <strong>Paw Fable credits:</strong> {entitlement.fableCreditsRemaining.toFixed(2)} PC remaining
                </p>
              )}
              <p style={{ margin: '8px 0 0 0', opacity: 0.6, fontSize: '0.85em' }}>
                1 PC ≈ $0.001 · typical chat turn ≈ 8–32 PC
              </p>
              {!entitlement.hasCreditsRemaining && (
                <p style={{ margin: '8px 0 0 0', opacity: 0.8, fontSize: '0.9em', fontWeight: 600 }}>
                  Usage limit reached — generation paused until the window rolls forward.
                </p>
              )}
            </>
          )
        ) : (
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9em' }}>…</p>
        )}
      </div>

      {/* Cancellation Section */}
      <div style={{ paddingTop: 16 }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Cancellation</h3>
        <p style={{ margin: '0 0 12px 0', opacity: 0.7, fontSize: '0.85em', lineHeight: 1.5 }}>
          Cancel plan
        </p>
        <button type="button" style={redButton}>
          Cancel
        </button>
      </div>

      {message && <p style={{ margin: '16px 0 0 0', opacity: 0.8, fontSize: '0.9em', color: '#4cb050' }}>{message}</p>}
    </div>
  );
}
