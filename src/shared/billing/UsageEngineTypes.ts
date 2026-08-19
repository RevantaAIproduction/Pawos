import type { SubscriptionTierId } from './BillingTypes';

/**
 * Every capability the Usage & Entitlement Engine tracks. 'aiReasoning' has
 * its MONTHLY LIMIT configured here, in the same single UsageQuotaConfig
 * table as every other capability (Paw Compute requirement: "a single
 * configuration source used by the Usage Engine") — but its own USAGE
 * COUNTER deliberately stays where it already lived: CreditStore for every
 * non-pooled tier (Go/Pro/Pro Max/Team Standard/Team Premium), and
 * organization_usage_counters via increment_organization_usage() for pooled
 * Enterprise, exactly like the other 7 capabilities. Duplicating a second
 * local counter for it in UsageStore would create exactly the kind of
 * two-competing-sources-of-truth problem the Mobile Presence audit flagged
 * elsewhere (EngineeringMemoryStore vs MemoryGraphStore) — see
 * TRACKED_USAGE_CAPABILITIES below for the counter-ownership split.
 * getUnifiedUsageSummary() merges CreditStore's real numbers in under the
 * 'aiReasoning' key (now resolved from this same config) so callers see one
 * complete picture without this engine re-implementing that tracking.
 */
export type UsageCapability =
  | 'aiReasoning'
  | 'repositoryAnalysis'
  | 'websiteAnalysis'
  | 'codeExecution'
  | 'browserAutomation'
  | 'desktopAutomation'
  | 'longRunningWorkflow'
  | 'autonomousExecution';

/** The 7 capabilities whose LOCAL non-pooled COUNTER lives in UsageStore (main process) — everything except 'aiReasoning', whose counter lives in CreditStore instead (see the type doc above). This list is about counter ownership, not configuration — 'aiReasoning' is still fully present in UsageQuotaConfig's perUserQuotas for every tier. */
export const TRACKED_USAGE_CAPABILITIES: Exclude<UsageCapability, 'aiReasoning'>[] = [
  'repositoryAnalysis',
  'websiteAnalysis',
  'codeExecution',
  'browserAutomation',
  'desktopAutomation',
  'longRunningWorkflow',
  'autonomousExecution',
];

/**
 * Team Standard and Team Premium are both `SubscriptionTierId: 'team'` at
 * the account level (distinguished by `SeatTier`, see BillingTypes.ts), but
 * they need genuinely different usage quotas ("Team Premium: larger per-user
 * allocation"). Rather than overload `SubscriptionTierId` itself with a
 * value that isn't a real subscription tier, the Usage Engine's config uses
 * this dedicated key: 'team' means the Standard rate, 'teamPremium' is a
 * config-table-only key resolved via seatTier === 'premium'. See
 * UsageQuotaConfigStore.resolveQuotaTierKey().
 */
export type UsageQuotaTierKey = SubscriptionTierId | 'teamPremium';

export type CapabilityQuotaConfig = {
  /** null = uncapped for this tier/capability. Never used for Go's execution-class capabilities today (Go blocks those entirely via monthlyLimit: 0, not null-as-uncapped) — see UsageQuotaConfigStore.defaultConfig(). */
  monthlyLimit: number | null;
  /**
   * Weekly-cadence cap, additive alongside monthlyLimit — both are enforced independently
   * (whichever binds first blocks further usage this period). null = no weekly cap for this
   * tier/capability. Only 'aiReasoning' on pro/proMax has a real weekly number today (Pro:
   * 1,000/week, Pro Max: 10,000/week) — every other tier/capability stays monthly-only.
   */
  weeklyLimit: number | null;
};

export type TierUsageQuotaConfig = {
  tier: UsageQuotaTierKey;
  /**
   * Per-account monthly limit for every capability, including 'aiReasoning'.
   * Ignored (informational only) for 'enterprise', which is pooled instead —
   * the real enforced pooled number lives in the matching Supabase
   * usage_quota_config row, read by increment_organization_usage().
   */
  perUserQuotas: Record<UsageCapability, CapabilityQuotaConfig>;
  /** Only true for 'enterprise' — usage is summed across the whole organization against one shared pool per capability, enforced server-side by increment_organization_usage(). */
  pooled: boolean;
  /**
   * Only set for 'proMax' — a real multiplier applied to Pro's OWN configured
   * quota at read time, never a second hardcoded number. This is the
   * mechanism that makes "Pro Max = 20x Pro" true by construction: change
   * Pro's number and Pro Max's effective quota changes with it automatically.
   * weeklyMultiplier is a separate ratio for the weekly cadence specifically
   * (Pro Max's weekly cap is 10x Pro's, not 20x — a deliberately different
   * ratio from the monthly one) — falls back to `multiplier` when unset.
   */
  derivedFrom?: { tier: UsageQuotaTierKey; multiplier: number; weeklyMultiplier?: number };
};

export type UsageQuotaConfig = {
  tiers: Record<UsageQuotaTierKey, TierUsageQuotaConfig>;
};

export type CapabilityUsageSummary = {
  capability: UsageCapability;
  /** Resolved effective limit for the account's current tier (Pro Max already multiplied out) — null means uncapped. */
  limit: number | null;
  used: number;
  /** Timestamp of next reset boundary. null for rolling-window capabilities (aiReasoning) which have no fixed reset. */
  periodResetsAt: number | null;
  pooled: boolean;
};
