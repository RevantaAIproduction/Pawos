/**
 * Referral Credits — a dollar-denominated bonus balance granted only by the referral engine
 * (see supabase/migrations/20260724010000_referral_engine.sql /
 * 20260726030000_referral_credits.sql), completely separate from both Subscription billing
 * (PricingConfigStore.ts) and the Ticket Balance wallet (AutonomousTaskBillingTypes.ts). Per the
 * product requirement, Referral Credits are usable only for Coding Runtime, AI Runtime, Companion
 * Runtime, and future runtime-based usage — never for the Autonomous Ticket System, ticket
 * investigations, subscriptions, plan upgrades, cash withdrawal, transfers, or any external
 * payout. There is currently no enforced per-usage metering for Coding/AI/Companion Runtime
 * consumption in this codebase (EntitlementService's own monthlyCreditLimit is null/uncapped for
 * every real tier — "Business Configuration Required"), so this balance is real and grantable
 * today but has no live deduction path yet; that wiring lands once such metering exists, the same
 * honest "recorded, not yet consumable" state already accepted for CreditStore's own limit: null.
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
