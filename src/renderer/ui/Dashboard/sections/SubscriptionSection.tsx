import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { UsageCreditsPanel } from './UsageCreditsPanel';
import { AutonomousCreditsPanel } from './AutonomousCreditsPanel';
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
  if (!plan) return 'â€¦';
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}â€“${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing â€” ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/${plan.billingPeriod} â€” ${range}`;
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
  const [goRefreshesRemaining, setGoRefreshesRemaining] = useState<number | null>(null);
  const [deviceHash, setDeviceHash] = useState<string | null>(null);

  const currentTier = subscription?.tier || 'go';

  const refresh = async () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
    
    try {
      const identity = await ipc.deviceGetLocalIdentity();
      if (identity.deviceHash) {
        setDeviceHash(identity.deviceHash);
        const { organizationUsageService } = await import('../../../billing/OrganizationUsageService');
        const remaining = await organizationUsageService.getGoRefreshesRemaining(identity.deviceHash);
        setGoRefreshesRemaining(remaining);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (user.isGuest) return;
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    ipc.onSubscriptionUpdated(() => {
      refresh();
      setMessage('âœ… Payment confirmed â€” your plan has been updated.');
    });

    return () => window.removeEventListener('focus', onFocus);
  }, [user.isGuest]);

  const downgrade = async (tier: SubscriptionTierId) => {
    try {
      await ipc.billingSetSubscriptionTier(tier);
      refresh();
      setMessage(`âœ… Switched to ${TIER_LABELS[tier]}.`);
    } catch (error) {
      setMessage(`âŒ Failed to switch plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (user.isGuest) {
    return (
            <div style={{ padding: '24px 0' }}>
        {entitlement?.buildEntitlement?.active && (
          <div style={{ marginBottom: 32, padding: 16, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 8 }}>
            <h3 style={{ fontSize: '1.1em', fontWeight: 700, margin: '0 0 8px 0', color: '#818cf8' }}>PawOS Build Cohort</h3>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9em' }}>Included PC: {entitlement.buildEntitlement.includedPc}</p>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9em' }}>Purchased PC: {entitlement.buildEntitlement.purchasedPc}</p>
            {entitlement.buildEntitlement.exhaustedAt && <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>Exhausted at: {new Date(entitlement.buildEntitlement.exhaustedAt).toLocaleString()}</p>}
          </div>
        )}
        <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Subscription</h2>
        <p style={{ fontSize: '0.9em', opacity: 0.6, margin: '0 0 16px 0' }}>Sign in to manage your subscription.</p>
      </div>
    );
  }

  const currentPlan = pricing?.plans.find((p) => p.tier === currentTier);

  return (
          <div style={{ padding: '24px 0' }}>
        {entitlement?.buildEntitlement?.active && (
          <div style={{ marginBottom: 32, padding: 16, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 8 }}>
            <h3 style={{ fontSize: '1.1em', fontWeight: 700, margin: '0 0 8px 0', color: '#818cf8' }}>PawOS Build Cohort</h3>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9em' }}>Included PC: {entitlement.buildEntitlement.includedPc}</p>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.9em' }}>Purchased PC: {entitlement.buildEntitlement.purchasedPc}</p>
            {entitlement.buildEntitlement.exhaustedAt && <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>Exhausted at: {new Date(entitlement.buildEntitlement.exhaustedAt).toLocaleString()}</p>}
          </div>
        )}
      {/* Current Plan Display - Premium UI */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 4px 0' }}>{TIER_LABELS[currentTier]}</h3>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 4px 0' }}>Monthly</p>
            <p style={{ fontSize: '0.85em', opacity: 0.6, margin: 0 }}>Your subscription will auto renew on N/A.</p>
            
            {currentTier === 'go' && goRefreshesRemaining !== null && (
              <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.9em' }}>
                  <strong>Free Refreshes Remaining:</strong> {goRefreshesRemaining} / 3
                </p>
                <button
                  disabled={goRefreshesRemaining <= 0}
                  onClick={async () => {
                    try {
                      if (!deviceHash) return;
                      const { organizationUsageService } = await import('../../../billing/OrganizationUsageService');
                      const success = await organizationUsageService.consumeGoRefresh(deviceHash);
                      if (success) {
                        setMessage('✅ Usage refreshed successfully!');
                        refresh();
                      } else {
                        setMessage('❌ No refreshes remaining.');
                      }
                    } catch (e) {
                      setMessage(`❌ Failed to refresh: ${e instanceof Error ? e.message : String(e)}`);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: goRefreshesRemaining > 0 ? '#4cb050' : '#404040',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: goRefreshesRemaining > 0 ? 'pointer' : 'not-allowed',
                    fontSize: '0.85em',
                  }}
                >
                  Refresh Usage
                </button>
              </div>
            )}
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
      <UsageCreditsPanel userEmail={user.email} onPaymentComplete={refresh} />
      <AutonomousCreditsPanel userEmail={user.email} onPaymentComplete={refresh} currentTier={currentTier} />

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
            color: message.includes('âœ“') || message.includes('âœ…') ? '#4cb050' : '#ef4444',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

