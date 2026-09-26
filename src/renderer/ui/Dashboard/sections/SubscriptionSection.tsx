import React, { useEffect, useState } from 'react';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { UsageCreditsPanel } from './UsageCreditsPanel';
import { AutonomousCreditsPanel } from './AutonomousCreditsPanel';
import { InvoicesTable } from '../../billing/InvoicesTable';
import type { AuthUser } from '../../../auth/AuthTypes';
import {
  type PricingConfig,
  type PricingPlan,
  type SubscriptionState,
  type SubscriptionTierId,
} from '../../../../shared/billing/BillingTypes';
import { useEntitlementSnapshot } from '../../../billing/useEntitlementSnapshot';
import { describeBuildAccess, formatDate, formatPlanName, formatTierLabel } from '../../../billing/EntitlementDisplay';

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
  const entitlement = useEntitlementSnapshot();
  const buildAccess = describeBuildAccess(entitlement);
  const isBuild = buildAccess.kind === 'active';
  const [message, setMessage] = useState<string | null>(null);
  const currentTier: SubscriptionTierId = subscription?.tier ?? 'go';
  const billingEmail = user.email ?? '';

  const refresh = async () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
  };

  const downgrade = async (tier: SubscriptionTierId) => {
    setMessage(null);
    try {
      const updated = await ipc.billingSetSubscriptionTier(tier);
      setSubscription(updated);
      setMessage('Subscription updated.');
      refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to update subscription.');
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div>
      <div style={{
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: 8,
        padding: "20px",
        marginBottom: "24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <div style={{ fontSize: "0.85em", color: "rgba(255, 255, 255, 0.5)", marginBottom: 4 }}>Current Plan</div>
          <div style={{ fontSize: "1.2em", fontWeight: 600 }} data-testid="current-plan-label">
            {isBuild
              ? formatTierLabel('build')
              : currentTier === 'pro' || currentTier === 'proMax'
                ? formatPlanName({ tier: currentTier, proMaxVariant: subscription?.proMaxVariant, proBillingFrequency: subscription?.proBillingFrequency })
                : TIER_LABELS[currentTier]}
          </div>
          {buildAccess.kind === 'active' && (
            <div style={{ fontSize: "0.85em", marginTop: 6, color: "rgba(255, 255, 255, 0.7)", lineHeight: 1.5 }} data-testid="build-access-details">
              Student program access · started {formatDate(buildAccess.startsAt)} · ends {formatDate(buildAccess.endsAt)}
              {" "}({buildAccess.daysLeft} day{buildAccess.daysLeft === 1 ? "" : "s"} left)
              <br />
              Includes 1,500 PC per week (up to 500 PC in any 5-hour window) and 15 active hours per week.
              After it ends your account returns to {TIER_LABELS[currentTier]}.
            </div>
          )}
          {buildAccess.kind === 'expired' && (
            <div style={{ fontSize: "0.85em", marginTop: 6, color: "rgba(255, 255, 255, 0.6)" }} data-testid="build-access-details">
              PawOS Build access ended {formatDate(buildAccess.endsAt)}.
            </div>
          )}
          {buildAccess.kind === 'revoked' && (
            <div style={{ fontSize: "0.85em", marginTop: 6, color: "rgba(255, 255, 255, 0.6)" }} data-testid="build-access-details">
              PawOS Build access was removed{buildAccess.revokedAt ? ` on ${formatDate(buildAccess.revokedAt)}` : ''}.
            </div>
          )}
        </div>
        
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => onUpgrade()}
            style={{
              padding: "8px 16px",
              backgroundColor: "#404040",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: "0.9em",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Adjust plan
          </button>
        </div>
      </div>

      {/* Payment Panels — not offered during PawOS Build: Build capacity is included-only (purchased
          Compute Credits don't extend it) and the Autonomous Ticket System isn't part of the program. */}
      {!isBuild && (
        <>
          <UsageCreditsPanel userEmail={billingEmail} onPaymentComplete={refresh} />
          <AutonomousCreditsPanel userEmail={billingEmail} onPaymentComplete={refresh} currentTier={currentTier} />
        </>
      )}

      {/* Invoices */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Invoices</h3>
        <InvoicesTable />
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


