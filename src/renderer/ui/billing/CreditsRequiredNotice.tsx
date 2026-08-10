import React from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { SeatTier, SubscriptionTierId } from '../../../shared/billing/BillingTypes';

type PrimaryActionId = 'upgrade' | 'buyCompute' | 'contactSales' | 'contactAdmin' | 'requestMoreCompute';

type PrimaryAction = {
  id: PrimaryActionId;
  label: string;
};

/**
 * Determines the exactly-two (or fewer, never more) primary actions shown once Paw Compute is
 * exhausted, purely from the account's current tier/seatTier/pooled status — never a static list.
 * Each tier's pair points strictly upward (the next real tier up, or a purchase), never sideways
 * or down, per the frozen UX requirement. Exported for direct unit testing.
 */
export function getExhaustionPrimaryActions(
  tier: SubscriptionTierId,
  seatTier: SeatTier | undefined,
  pooled: boolean,
  enterpriseContactAvailable: boolean
): PrimaryAction[] {
  if (pooled) {
    // Enterprise: no personal purchase flow, no upgrade (already the top tier) — the org's pool is
    // shared and administrator-controlled.
    return [
      { id: 'contactAdmin', label: 'Contact Organization Administrator' },
      { id: 'requestMoreCompute', label: 'Request Additional Organization Paw Compute' },
    ];
  }
  if (tier === 'go') {
    return [
      { id: 'upgrade', label: 'Upgrade to Pro' },
      { id: 'buyCompute', label: 'Buy Paw Compute' },
    ];
  }
  if (tier === 'pro') {
    return [
      { id: 'upgrade', label: 'Upgrade to Pro Max' },
      { id: 'buyCompute', label: 'Buy Paw Compute' },
    ];
  }
  if (tier === 'proMax') {
    // Pro Max is capability-identical to every tier above it in the personal ladder — there is no
    // "lateral" personal upgrade, only a path into Enterprise (an organization tier), which is
    // enough of a structural jump to warrant a dedicated Enterprise page rather than the in-app
    // upgrade flow. Contact Sales is omitted entirely (not shown disabled) when that path isn't
    // reachable from this screen, leaving Buy Paw Compute as the sole action.
    return enterpriseContactAvailable
      ? [
          { id: 'buyCompute', label: 'Buy Paw Compute' },
          { id: 'contactSales', label: 'Contact Sales' },
        ]
      : [{ id: 'buyCompute', label: 'Buy Paw Compute' }];
  }
  if (tier === 'team') {
    return seatTier === 'premium'
      ? [
          { id: 'upgrade', label: 'Upgrade to Enterprise' },
          { id: 'buyCompute', label: 'Buy Paw Compute' },
        ]
      : [
          { id: 'upgrade', label: 'Upgrade to Team Premium' },
          { id: 'buyCompute', label: 'Buy Paw Compute' },
        ];
  }
  // Unreachable in practice (every SubscriptionTierId is covered above), kept as an honest fallback.
  return [{ id: 'buyCompute', label: 'Buy Paw Compute' }];
}

/**
 * The friendly, non-blocking notice shown whenever an AI request can't run because the current
 * plan's Paw Compute allowance for this period is exhausted. Never a full-screen blocker — desktop
 * features keep working underneath it; this is a dismissible inline card, reused by any runtime
 * that hits an entitlement/usage wall (see EntitlementService). The actual block is enforced
 * server-side (hasCreditsRemaining()/pooled RPC), never by this component — dismissing the notice
 * does not restore usage.
 *
 * Shows exactly the two (or fewer) tier-determined primary actions from getExhaustionPrimaryActions
 * above — never a third purchase option. "Use Paw Credits" is not a primary action (it isn't a new
 * purchase, it's spending an existing balance) — when available it renders as a smaller secondary
 * link beneath the primary pair, exactly as before this pass; nothing about Paw Credits itself
 * changed.
 */
export function CreditsRequiredNotice({
  tier,
  seatTier,
  pooled,
  enterpriseContactAvailable = true,
  onDismiss,
  onUpgrade,
  onBuyCompute,
  onContactSales,
  onContactAdmin,
  onRequestMoreCompute,
  pawCreditsBalanceUsd,
  onUseCredits,
  redeeming,
  redeemError,
}: {
  tier: SubscriptionTierId;
  seatTier?: SeatTier;
  /** True only for Enterprise — the account draws from a shared organization pool, not a personal allowance. */
  pooled: boolean;
  /** Whether the Pro Max → Enterprise "Contact Sales" path is reachable from this screen. Defaults to true (the real pawos-web /enterprise page). */
  enterpriseContactAvailable?: boolean;
  onDismiss: () => void;
  /** Opens the in-app upgrade flow for the next tier up. Omit where there's no real navigation target yet. */
  onUpgrade?: () => void;
  /** Opens the Paw Compute top-up flow. Omit where there's no real navigation target yet. */
  onBuyCompute?: () => void;
  /** Opens the Enterprise info/signup page. Omit where there's no real navigation target yet. */
  onContactSales?: () => void;
  onContactAdmin?: () => void;
  onRequestMoreCompute?: () => void;
  /** The account's current Paw Credits (Referral Credits) balance in USD — the secondary "Use Paw Credits" link only renders when this is greater than 0. */
  pawCreditsBalanceUsd?: number;
  onUseCredits?: () => void;
  redeeming?: boolean;
  redeemError?: string | null;
}) {
  const message = pooled
    ? "Your organization has used all of its pooled Paw Compute for this period. Everything else keeps working — reach out to your organization administrator, or wait for the next monthly reset."
    : tier === 'go'
      ? "You've used all of Go's Paw Compute for this period. Everything else keeps working."
      : "You've used all of this period's Paw Compute. Everything else keeps working.";

  const actions = getExhaustionPrimaryActions(tier, seatTier, pooled, enterpriseContactAvailable);
  const handlers: Record<PrimaryActionId, (() => void) | undefined> = {
    upgrade: onUpgrade,
    buyCompute: onBuyCompute,
    contactSales: onContactSales,
    contactAdmin: onContactAdmin,
    requestMoreCompute: onRequestMoreCompute,
  };

  const hasCredits = !pooled && (pawCreditsBalanceUsd ?? 0) > 0;

  return (
    <div className={styles.card} style={{ borderColor: 'var(--accent, #6d5efc)' }}>
      <h3 className={styles.cardTitle}>More Paw Compute needed</h3>
      <p className={styles.cardBody}>{message}</p>
      {redeemError && (
        <p className={styles.cardBody} style={{ color: 'var(--danger, #e05a5a)' }}>
          {redeemError}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {actions.map((action, index) => {
          const handler = handlers[action.id];
          if (!handler) return null;
          return (
            <button
              key={action.id}
              type="button"
              className={index === 0 ? styles.primaryButton : styles.chip}
              onClick={handler}
            >
              {action.label}
            </button>
          );
        })}
        <button type="button" className={styles.chip} onClick={onDismiss}>
          Got it
        </button>
      </div>
      {hasCredits && onUseCredits && (
        <p className={styles.cardBody} style={{ marginTop: 8, fontSize: 12 }}>
          Or{' '}
          <button
            type="button"
            onClick={onUseCredits}
            disabled={redeeming}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #6d5efc)', textDecoration: 'underline', cursor: redeeming ? 'default' : 'pointer', font: 'inherit' }}
          >
            {redeeming ? 'redeeming your Paw Credits…' : `use your $${(pawCreditsBalanceUsd ?? 0).toFixed(2)} Paw Credits balance`}
          </button>{' '}
          to extend this period's Paw Compute.
        </p>
      )}
    </div>
  );
}
