/**
 * Paw Go / Paw Pro subscription tiers, pricing, and AI credit tracking —
 * account-level billing concepts. Distinct from
 * src/main/execution/CodingModeStore.ts, which is the Coding Intelligence
 * Runtime's own LOCAL Go/Pro capability toggle (approved, frozen-adjacent,
 * and left untouched here) — that store still solely governs what the
 * Coding Runtime allows. This module is the separate, new account/business
 * layer: which tier the user is subscribed to, what it costs, and how much
 * of their AI usage they've consumed. The two are not wired together yet —
 * doing so is a real feature-gating decision explicitly out of scope until
 * business configuration (real pricing, a payment processor) exists.
 */
export type SubscriptionTierId = 'go' | 'pro';

export type SubscriptionStatus = 'active' | 'trialing' | 'none';

export type SubscriptionState = {
  tier: SubscriptionTierId;
  status: SubscriptionStatus;
  /** Set only once a real payment provider is configured and a checkout actually completes. */
  renewsAt?: number;
};

export type PricingPlan = {
  id: SubscriptionTierId;
  label: string;
  /** null = price not yet decided — "Business Configuration Required". Never a fabricated number. */
  priceCents: number | null;
  currency: string;
  billingPeriod: 'month' | 'year';
  features: string[];
};

export type BillingProviderId = 'none' | 'stripe';

export type PricingConfig = {
  plans: PricingPlan[];
  billingProvider: BillingProviderId;
};

export type CreditBalance = {
  /** null = no cap configured yet — usage is tracked but never blocks anything. "Business Configuration Required". */
  limit: number | null;
  usedThisPeriod: number;
  periodResetsAt: number;
};

export type CreditConsumptionRecord = {
  amount: number;
  reason: string;
  at: number;
};

export type BillingCheckoutResult = { ok: true; checkoutUrl: string } | { ok: false; reason: string };
