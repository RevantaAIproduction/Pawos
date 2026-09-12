import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { TierPurchasePanel } from './TierPurchasePanel';
import { UsageCreditsPanel } from './UsageCreditsPanel';
import { AutonomousCreditsPanel } from './AutonomousCreditsPanel';
import { EnterpriseContactPanel } from './EnterpriseContactPanel';
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
  const [message, setMessage] = useState<string | null>(null);

  const currentTier = subscription?.tier || 'go';

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
      setMessage('✅ Payment confirmed — your plan has been updated.');
    });

    return () => window.removeEventListener('focus', onFocus);
  }, [user.isGuest]);

  const downgrade = async (tier: SubscriptionTierId) => {
    try {
      await ipc.billingSetSubscriptionTier(tier);
      refresh();
      setMessage(`✅ Switched to ${TIER_LABELS[tier]}.`);
    } catch (error) {
      setMessage(`❌ Failed to switch plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (user.isGuest) {
    return (
      <div style={{ padding: '24px 0' }}>
        <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Subscription</h2>
        <p style={{ fontSize: '0.9em', opacity: 0.6, margin: '0 0 16px 0' }}>Sign in to manage your subscription.</p>
      </div>
    );
  }

  const currentPlan = pricing?.plans.find((p) => p.tier === currentTier);

  return (
    <div style={{ padding: '24px 0' }}>
      <h2 style={{ fontSize: '1.5em', fontWeight: 700, margin: '0 0 8px 0' }}>Billing</h2>
      <p style={{ fontSize: '0.9em', opacity: 0.6, margin: '0 0 24px 0' }}>Plan, credits, and usage.</p>

      {/* Current Plan Display - Premium UI */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 4px 0' }}>{TIER_LABELS[currentTier]}</h3>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 4px 0' }}>Monthly</p>
            <p style={{ fontSize: '0.85em', opacity: 0.6, margin: 0 }}>Your subscription will auto renew on N/A.</p>
          </div>
          <button
            onClick={() => onUpgrade()}
            style={{
              padding: '8px 16px',
              backgroundColor: '#404040',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: '0.9em',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            Adjust plan
          </button>
        </div>
      </div>

      {/* Payment Panels */}
      <TierPurchasePanel currentTier={currentTier} userEmail={user.email} onPaymentComplete={refresh} />
      <UsageCreditsPanel userEmail={user.email} onPaymentComplete={refresh} />
      <AutonomousCreditsPanel userEmail={user.email} onPaymentComplete={refresh} />
      <EnterpriseContactPanel userEmail={user.email} onSubmitComplete={refresh} />

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
              {/* No invoices yet */}
              <tr>
                <td colSpan={4} style={{ padding: '16px 0', textAlign: 'center', opacity: 0.5, fontSize: '0.9em' }}>
                  No invoices yet
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancellation */}
      <div style={{ paddingBottom: 0 }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Cancellation</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.85em', opacity: 0.6, lineHeight: 1.5 }}>Cancel your plan anytime.</p>
        <button
          type="button"
          disabled={currentTier === 'go'}
          onClick={() => {
            if (confirm('Are you sure you want to cancel your subscription? You will lose access to all paid features.')) {
              downgrade('go');
            }
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: currentTier === 'go' ? '#999999' : '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: currentTier === 'go' ? 'not-allowed' : 'pointer',
            fontSize: '0.9em',
            fontWeight: 500,
            opacity: currentTier === 'go' ? 0.5 : 1,
          }}
          title={currentTier === 'go' ? 'Already on Go plan' : ''}
        >
          Cancel Subscription
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <p
          style={{
            margin: '16px 0 0 0',
            opacity: 0.8,
            fontSize: '0.9em',
            color: message.includes('✓') || message.includes('✅') ? '#4cb050' : '#ef4444',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
