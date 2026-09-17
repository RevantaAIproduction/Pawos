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
  const [deviceId, setDeviceHash] = useState<string | null>(null);

  const currentTier = subscription?.tier || 'go';

  const refresh = async () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
    
    
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


