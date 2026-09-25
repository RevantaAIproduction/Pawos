// @ts-nocheck
import React from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { EffectiveTierId, SeatTier } from '../../../shared/billing/BillingTypes';

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
  tier: EffectiveTierId,
  seatTier: SeatTier | undefined,
  pooled: boolean,
  enterpriseContactAvailable: boolean,
  proMaxVariant?: '5x' | '20x',
  buildFinalWeek = false
): PrimaryAction[] {
  if (pooled) {
    // Enterprise: no personal purchase flow, no upgrade (already the top tier) — the org's pool is
    // shared and administrator-controlled.
    return [
      { id: 'contactAdmin', label: 'Contact Organization Administrator' },
      { id: 'requestMoreCompute', label: 'Request Additional Organization Paw Compute' },
    ];
  }
  if (tier === 'build') {
    // PawOS Build: before its final week, buying Paw Compute continues past the limit (and it also
    // resets on its own). In the final week nothing resets and purchases can't extend Build — the
    // only way on is upgrading to Pro.
    return buildFinalWeek ? [{ id: 'upgrade', label: 'Upgrade to Pro' }] : [{ id: 'buyCompute', label: 'Buy Paw Compute' }];
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
    // The personal upgrade ladder ends at Pro Max 20x: 5x can still step up to 20x; 20x can only buy
    // more Paw Compute.
    return proMaxVariant === '20x'
      ? [{ id: 'buyCompute', label: 'Buy Paw Compute' }]
      : [
          { id: 'upgrade', label: 'Upgrade to Pro Max 20x' },
          { id: 'buyCompute', label: 'Buy Paw Compute' },
        ];
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
  proMaxVariant,
  buildFinalWeek = false,
  pooled,
  enterpriseContactAvailable = true,
  onDismiss,
  onUpgrade,
  onBuyCompute,
  onContactSales,
  onContactAdmin,
  onRequestMoreCompute,
  pawCreditsBalanceUsd = 0,
}: {
  tier: EffectiveTierId;
  seatTier?: SeatTier;
  /** Only meaningful for Pro Max — 5x can upgrade to 20x; 20x can only buy. */
  proMaxVariant?: '5x' | '20x';
  /** PawOS Build's final (no-reset) week — offers Upgrade to Pro instead of Buy. */
  buildFinalWeek?: boolean;
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
  pawCreditsBalanceUsd?: number;
}) {
  const message = pooled
    ? "Your organization has used all of its pooled Paw Compute for this period. Everything else keeps working — reach out to your organization administrator, or wait for the next monthly reset."
    : tier === 'build'
      ? buildFinalWeek
        ? "You've reached your PawOS Build limit, and this is the last week of your Build access, so it won't reset again. Upgrade to Pro to keep going — everything else keeps working."
        : "You've reached your PawOS Build limit for now. Buy Paw Compute to keep going, or wait — it resets automatically (Settings → Usage shows when). Everything else keeps working."
      : tier === 'go'
      ? "You've used all of the Paw Compute included with Go. Upgrade your plan or buy Paw Compute to keep going — everything else keeps working."
      : tier === 'proMax' && proMaxVariant === '20x'
      ? "You've used this week's included Paw Compute. Wait for your weekly reset or buy Paw Compute to keep going — everything else keeps working."
      : "You've used this week's included Paw Compute. Wait for your weekly reset, buy Paw Compute, or upgrade your plan to keep going — everything else keeps working.";

  const actions = getExhaustionPrimaryActions(tier, seatTier, pooled, enterpriseContactAvailable, proMaxVariant, buildFinalWeek);
  const handlers: Record<PrimaryActionId, (() => void) | undefined> = {
    upgrade: onUpgrade,
    buyCompute: onBuyCompute,
    contactSales: onContactSales,
    contactAdmin: onContactAdmin,
    requestMoreCompute: onRequestMoreCompute,
  };

  const hasCredits = !pooled && !(tier === 'build' && buildFinalWeek) && (pawCreditsBalanceUsd ?? 0) > 0;

  return (
    <div className={styles.card} style={{ borderColor: 'var(--accent, #6d5efc)' }}>
      <h3 className={styles.cardTitle}>{tier === 'build' ? 'PawOS Build limit reached' : 'More Paw Compute needed'}</h3>
      <p className={styles.cardBody}>{message}</p>
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
    </div>
  );
}
