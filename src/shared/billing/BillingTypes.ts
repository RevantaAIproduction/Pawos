import type { PawModelId } from '../ai/PawModelTypes';

/**
 * Paw Go / Pro / Pro Max / Team / Enterprise subscription tiers, pricing, feature
 * entitlements, and AI credit tracking — account-level billing concepts.
 * Distinct from src/main/execution/CodingModeStore.ts, which is the Coding
 * Intelligence Runtime's own LOCAL Go/Pro capability toggle (approved,
 * frozen-adjacent, and left untouched here) — that store still solely
 * governs whether the Coding Runtime may execute vs. only plan, independent
 * of which account tier is subscribed. This module is the separate,
 * account-wide layer: which tier the user is subscribed to, what it costs,
 * which Paw models and features it unlocks, and how much AI usage they've
 * consumed.
 */
export type SubscriptionTierId = 'go' | 'pro' | 'proMax' | 'team' | 'enterprise';

/**
 * Only meaningful within a 'team' organization: a member's seat determines
 * their usage limits (see EntitlementService). Enterprise seats are
 * uniform — Enterprise's variable cost comes from metered Autonomous
 * Engineering Task usage instead (see AutonomousTaskBillingTypes.ts), not
 * from a seat-tier split.
 */
export type SeatTier = 'standard' | 'premium';

export type SubscriptionStatus = 'active' | 'trialing' | 'none';

export type SubscriptionState = {
  tier: SubscriptionTierId;
  status: SubscriptionStatus;
  /** Set only once a real payment provider is configured and a checkout actually completes. */
  renewsAt?: number;
  /** Only meaningful when tier === 'team' — which seat rate this account was invited/assigned at. */
  seatTier?: SeatTier;
};

/** One of Team's two seat rates — a Team org can mix Standard and Premium seats across members. */
export type SeatOption = {
  seatTier: SeatTier;
  label: string;
  /** null = price not yet decided — "Business Configuration Required". Never a fabricated number. */
  priceCents: number | null;
  description: string;
};

/** Enterprise's variable cost component — real metered billing via the Autonomous Engineering Task system, not fabricated per-token/API metering. */
export type UsageBillingDescriptor = {
  label: string;
  description: string;
};

export type PricingPlan = {
  id: SubscriptionTierId;
  label: string;
  /** null = price not yet decided — "Business Configuration Required". Never a fabricated number. For Team this is the Standard seat price; see seatOptions for the full breakdown. For Enterprise this is the per-seat base fee (usage is billed separately, see usageBilling). */
  priceCents: number | null;
  currency: string;
  billingPeriod: 'month' | 'year';
  features: string[];
  /** True for plans billed per-member rather than a single flat price (Team, Enterprise). */
  seatBased?: boolean;
  minSeats?: number;
  /** Absent = no upper bound (Enterprise). */
  maxSeats?: number;
  /** Team only: the real Standard/Premium seat choice offered per member. */
  seatOptions?: SeatOption[];
  /** Enterprise only: describes the metered usage component on top of the seat base fee. */
  usageBilling?: UsageBillingDescriptor;
};

export type BillingProviderId = 'none' | 'razorpay';

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

/**
 * Extra parameters only meaningful for seat-based tiers. `seatTier` selects
 * Team's Standard/Premium rate for the seats being purchased; `seatCount`
 * is how many seats at that rate. Absent for Go/Pro/Pro Max (flat pricing)
 * and for Enterprise's base fee (Enterprise seats are uniform — its
 * variable cost is metered Autonomous Engineering Task usage instead).
 */
export type CheckoutOptions = {
  seatTier?: SeatTier;
  seatCount?: number;
};

/**
 * Feature-level entitlements — every gate a runtime might need to check
 * (beyond "which Paw models are available", see PawModelId). The
 * EntitlementService (src/main/billing/EntitlementService.ts) is the only
 * place these are evaluated against the current tier; no runtime should
 * hard-code a tier check itself.
 */
export type FeatureId =
  | 'companionStudio'
  | 'desktopCompanion'
  | 'basicWorkspace'
  | 'basicFileManagement'
  | 'localRuntimeFeatures'
  | 'advancedRuntimes'
  | 'sharedWorkspaces'
  | 'organizationMembers'
  | 'sharedCompanions'
  | 'sharedCredits'
  | 'adminControls'
  | 'teamBilling'
  | 'creditPool'
  | 'taskManagement'
  | 'gitCollaboration'
  | 'remoteAssistance'
  | 'crmProjection'
  | 'governanceCredentialVault'
  | 'governanceApprovalQueue'
  | 'governanceAuditLog'
  | 'ssoConfiguration'
  | 'autonomousTaskBilling';

export type TierEntitlements = {
  tier: SubscriptionTierId;
  /** Empty array = no AI models at all (Paw Go). */
  models: PawModelId[];
  features: FeatureId[];
  /** null = uncapped for this tier's own credit pool (still subject to Business Configuration Required until a real limit is set). */
  monthlyCreditLimit: number | null;
  /** Only set when tier === 'team' — echoes which seat rate produced this entitlement set. */
  seatTier?: SeatTier;
};

export const SUBSCRIPTION_TIER_ORDER: SubscriptionTierId[] = ['go', 'pro', 'proMax', 'team', 'enterprise'];

/** The read-only snapshot the UI polls to render plan/models/features/credits — see EntitlementService.ts. */
export type EntitlementSnapshot = {
  tier: SubscriptionTierId;
  models: PawModelId[];
  features: FeatureId[];
  creditLimit: number | null;
  creditsUsedThisPeriod: number;
  hasCreditsRemaining: boolean;
  /** Only set when tier === 'team' — which seat rate (Standard/Premium) this account holds. */
  seatTier?: SeatTier;
};
