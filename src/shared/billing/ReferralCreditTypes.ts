/**
 * Referral Credits — a dollar-denominated bonus balance granted only by the referral engine
 * (see supabase/migrations/20260724010000_referral_engine.sql /
 * 20260726030000_referral_credits.sql), completely separate from both Subscription billing
 * (PricingConfigStore.ts) and the Ticket Balance wallet (AutonomousTaskBillingTypes.ts). Per the
 * product requirement, Referral Credits are usable only for Coding Runtime, AI Runtime, Companion
 * Runtime, and future runtime-based usage — never for the Autonomous Ticket System, ticket
 * investigations, subscriptions, plan upgrades, cash withdrawal, transfers, or any external
 * payout. This is "Paw Credits" in customer-facing copy — internal code keeps the existing
 * Referral Credits name (matching the codebase's own established internal-vs-display-name split,
 * e.g. AiUsageCategories.ts) since the wallet's origin (referrals) hasn't changed, only its
 * spendability.
 *
 * The redemption path (redeemForCompute()) now exists — see
 * supabase/migrations/20260802010000_referral_credits_compute_redemption.sql's
 * redeem_referral_credits_for_compute() RPC — closing the gap this comment used to describe
 * ("recorded, not yet consumable"). Redeeming only ever extends the current period's Paw Compute
 * allowance (via the local CreditStore bonus counter); it can never unlock a feature, model, or
 * tier the account isn't already entitled to — the redemption RPC has no awareness of
 * entitlements at all, it only moves a dollar figure.
 */

export type ReferralCreditSource = 'referral_milestone';

export type ReferralCreditBalance = {
  userId: string;
  balanceUsd: number;
  updatedAt: string;
};

export type ReferralCreditGrant = {
  id: string;
  userId: string;
  amountUsd: number;
  source: ReferralCreditSource;
  sourceRef: string | null;
  grantedAt: string;
};

/** How many bonus Paw Compute units (aiReasoning-capability turns) $1 of Referral Credits funds when redeemed — a real, provisional, "Business Configuration Required" rate, same discipline as every other placeholder business number in this codebase. Revisit this number, not its presence, once pricing is decided. */
export const PAW_COMPUTE_UNITS_PER_CREDIT_USD = 50;
