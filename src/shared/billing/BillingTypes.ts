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

export type RuntimeEntitlementId =
  | 'coding'
  | 'office'
  | 'browser'
  | 'communication'
  | 'infrastructure'
  | 'companion'
  | 'governance'
  | 'sales'
  | 'hr';

export type RuntimeEntitlementGrantSource = 'plan' | 'purchase' | 'organization';

export type RuntimeEntitlementGrant = {
  runtimeId: RuntimeEntitlementId;
  source: RuntimeEntitlementGrantSource;
  grantedAt: number;
  orderId?: string;
};

export type SubscriptionState = {
  tier: SubscriptionTierId;
  status: SubscriptionStatus;
  /** Authenticated PawOS account this local subscription cache belongs to. Missing on legacy device-local files. */
  accountId?: string;
  /** Set only once a real payment provider is configured and a checkout actually completes. */
  renewsAt?: number;
  /** Only meaningful when tier === 'team' — which seat rate this account was invited/assigned at. */
  seatTier?: SeatTier;
  runtimeEntitlements?: RuntimeEntitlementGrant[];
  /**
   * Runtime entitlement productization marker. Missing means this local
   * subscription file predates explicit runtime purchasing and needs the
   * one-time grandfather migration in SubscriptionStore.
   */
  runtimeEntitlementPolicyVersion?: number;
  /** Present only when a legacy paid account was converted into explicit source:'plan' grants. */
  runtimeEntitlementsGrandfatheredAt?: number;
  /** Timestamp when the $40 one-time onboarding benefit was granted (once per user lifetime). */
  oneTimeBenefitGrantedAt?: number;
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
  /** One-line positioning under the plan name (e.g. "Predictable usage per seat" for Team, "Flexible pooled usage" for Enterprise) — cosmetic only, no pricing logic depends on it. */
  tagline?: string;
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

/**
 * Editable Ticket Balance top-up configuration — completely separate from PricingConfig/plans
 * above (subscription pricing). Persisted so new preset amounts (e.g. a future $500 option) can be
 * added later purely as data, without a code change/redeploy. Volume-tiered per-ticket pricing
 * itself (TICKET_PRICING_TIERS in AutonomousTaskBillingTypes.ts) is not part of this config — only
 * the top-up amounts offered and the enforced minimum.
 */
export type TicketPricingConfig = {
  topupPresetsUsd: number[];
  minTopupUsd: number;
  /** Maximum single top-up, in USD. Client-side UX hinting only — the server (pawos-web's checkout-credits/credit-ticket-balance routes and the add_ticket_balance_service() SQL RPC) remains the sole authority. */
  maxTopupUsd: number;
};

export type CreditBalance = {
  /** Always null here — CreditStore itself never stores a limit; EntitlementService resolves the real one from UsageQuotaConfigStore. */
  limit: number | null;
  usedThisPeriod: number;
  /** Bonus Paw Compute headroom granted for the current period only (e.g. via Referral Credits redemption) — added on top of the tier's own configured limit, never replacing it. */
  bonusThisPeriod: number;
  periodResetsAt: number;
  /** Weekly-cadence counter, tracked independently of usedThisPeriod (monthly) — resets on its own weekly boundary. Real usage since the last weekly reset, regardless of whether the account's tier has a configured weekly limit at all. */
  usedThisWeek: number;
  weekResetsAt: number;
  /**
   * Paw Fable's own consumption counter — completely independent of usedThisPeriod/usedThisWeek,
   * since Fable never draws from the tier's included Paw Compute allowance. Fable turns increment
   * only this counter, against bonusThisPeriod (the purchased/redeemed Paw Credits pool) as the
   * ceiling; every other model's turn never touches this counter either direction. Resets alongside
   * bonusThisPeriod at the same monthly boundary — see CreditStore.freshPeriod().
   */
  fableUsedThisPeriod: number;
};

export type CreditConsumptionRecord = {
  amount: number;
  reason: string;
  at: number;
  /** Absent on records written before category tracking existed — the Analytics dashboard treats
   *  a missing category as 'chat' rather than fabricating a more specific one. See
   *  src/shared/billing/AiUsageCategories.ts for how this is derived. */
  category?: import('./AiUsageCategories').AiUsageCategory;
};

export type BillingCheckoutResult = { ok: true; checkoutUrl: string } | { ok: false; reason: string };

export type NativePaymentMethodId = 'upi' | 'card' | 'netbanking' | 'wallet';

export type NativePaymentMethodsResult =
  | { ok: true; methods: NativePaymentMethodId[] }
  | { ok: false; reason: string };

export type NativeSubscriptionCheckoutResult =
  | { ok: true; keyId: string; subscriptionId: string; tier: SubscriptionTierId; seatTier?: SeatTier; runtimeIds?: RuntimeEntitlementId[] }
  | { ok: false; reason: string };

export type NativeCreditsCheckoutResult =
  | { ok: true; keyId: string; orderId: string; amountUsd: number; amountInr: number; amountPaise: number; usdInrRate: number; currency: 'INR' }
  | { ok: false; reason: string };

export type NativeCreditsVerificationResult =
  | { ok: true; amountUsd: number; topupId?: string }
  | { ok: false; reason: string };

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
  runtimeIds?: RuntimeEntitlementId[];
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
  | 'connectLinear'
  | 'connectGoogleWorkspace'
  | 'connectJira'
  | 'connectSlack'
  | 'connectMicrosoft'
  | 'connectGithub'
  | 'connectGitlab'
  | 'connectVercel'
  | 'connectNetlify'
  | 'connectRailway'
  | 'ssoConfiguration'
  | 'autonomousTaskBilling'
  | 'mobilePairing'
  | 'crossDeviceSync'
  | 'mobileNotifications'
  | 'organizationCrossDeviceAlerts'
  | 'autonomousPlanBypass';

export type TierEntitlements = {
  tier: SubscriptionTierId;
  /** Paw Go includes only paw-flash (Think-class planning/analysis); Pro+ unlock the full roster. Empty would mean no AI at all — no tier is configured that way today. */
  models: PawModelId[];
  features: FeatureId[];
  /** null = uncapped. Resolved live from UsageQuotaConfigStore's single 'aiReasoning' config (Pro Max derives 20x Pro automatically) — never a static per-tier literal. */
  monthlyCreditLimit: number | null;
  /** Weekly-cadence cap, additive alongside monthlyCreditLimit — null means this tier has no weekly cap configured (today: every tier except pro/proMax). Resolved the same live way, Pro Max derives 10x Pro's weekly number (a different ratio from the monthly 20x). */
  weeklyCreditLimit: number | null;
  /** Only set when tier === 'team' — echoes which seat rate produced this entitlement set. */
  seatTier?: SeatTier;
};

export const SUBSCRIPTION_TIER_ORDER: SubscriptionTierId[] = ['go', 'pro', 'proMax', 'team', 'enterprise'];

/** The read-only snapshot the UI polls to render plan/models/features/credits — see EntitlementService.ts. */
export type EntitlementSnapshot = {
  tier: SubscriptionTierId;
  models: PawModelId[];
  features: FeatureId[];
  runtimeEntitlements: RuntimeEntitlementId[];
  /** Always null — monthly limits replaced by rolling windows. Kept for backward compatibility. */
  creditLimit: number | null;
  /** Deprecated: use usage5hPc / usage7dPc instead. Kept for backward compatibility. */
  creditsUsedThisPeriod: number;
  /** Extra Paw Compute headroom redeemed from Referral Credits ("Paw Credits") for the current period — see EntitlementService.grantComputeBonus(). Always 0 unless the user has redeemed credits this period. */
  bonusComputeThisPeriod: number;
  /** True when the account has Paw Compute remaining in both rolling windows (5h and 7d). Always true for pooled (Enterprise) tiers — the real check is server-side. */
  hasCreditsRemaining: boolean;
  /**
   * True only for Enterprise — the account's Paw Compute allowance is pooled
   * organization-wide and enforced server-side by
   * increment_organization_usage(), never by this local snapshot's own
   * hasCreditsRemaining (which is unconditionally true for a pooled tier at
   * this layer). Callers that gate a new AI request must, for a pooled
   * tier, call organizationUsageService.recordUsage(orgId, 'aiReasoning', 1)
   * themselves and treat a thrown error as "blocked" — see
   * useConversationController.ts.
   */
  pooled: boolean;
  /** Only set when tier === 'team' — which seat rate (Standard/Premium) this account holds. */
  seatTier?: SeatTier;
  /** Always null — replaced by rolling windows. Kept for backward compatibility. */
  weeklyCreditLimit: number | null;
  /** Deprecated: use usage7dPc instead. Kept for backward compatibility. */
  creditsUsedThisWeek: number;
  /** Deprecated: no fixed reset boundary in rolling windows. Kept for backward compatibility. */
  weekResetsAt: number;
  /**
   * Real remaining purchased-Paw-Credits headroom for Paw Fable specifically — max(0,
   * bonusComputeThisPeriod - fableUsedThisPeriod). Never derived from creditLimit/weeklyCreditLimit
   * or hasCreditsRemaining, since Fable is gated purely on this number: a turn on Paw Fable is
   * blocked once this reaches 0, even if hasCreditsRemaining is still true for every other model.
   */
  fableCreditsRemaining: number;

  // ── Rolling window Paw Compute (the active enforcement system) ──────────────
  /** Paw Compute consumed in the last 5 hours (rolling). */
  usage5hPc: number;
  /** Maximum Paw Compute allowed in any 5-hour rolling window for this tier. null = no cap. */
  limit5hPc: number | null;
  /** Paw Compute consumed in the last 7 days (rolling). */
  usage7dPc: number;
  /** Maximum Paw Compute allowed in any 7-day rolling window for this tier. null = no cap. */
  limit7dPc: number | null;
};
