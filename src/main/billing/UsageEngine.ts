import { entitlementService } from './EntitlementService';
import { creditStore } from './CreditStore';
import { usageStore } from './UsageStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import { TRACKED_USAGE_CAPABILITIES } from '../../shared/billing/UsageEngineTypes';
import type { CapabilityUsageSummary, UsageCapability } from '../../shared/billing/UsageEngineTypes';

export type UsageCheckResult =
  | { allowed: true; pooled: false }
  | { allowed: false; pooled: false; reason: string }
  /** Enterprise's pooled tiers are never authoritatively decided here — the Electron main process has no Supabase session (see UsageQuotaConfigStore.ts's doc comment), so the real check/increment happens via organizationUsageService.recordUsage() calling the increment_organization_usage() RPC, which raises if the pool is exhausted. Callers must branch on `pooled: true` and go through that renderer-side path instead of treating this as a green light. */
  | { allowed: true; pooled: true; deferTo: 'organizationUsageService' };

/**
 * The Usage & Entitlement Engine's main-process half — enforcement for
 * every NON-POOLED tier (Go/Pro/Pro Max/Team Standard/Team Premium). Reads
 * the current tier from EntitlementService (never a local hardcoded check,
 * matching the existing "Runtime -> Entitlement Service -> ... -> Execute"
 * discipline), resolves the effective quota via UsageQuotaConfigStore
 * (following Pro Max's derivedFrom multiplier), and tracks consumption via
 * UsageStore. 'aiReasoning' is deliberately excluded from canConsume/record
 * — that capability's real enforcement point is
 * entitlementService.hasCreditsRemaining()/creditStore, already wired
 * elsewhere; this engine only adds coverage for the 7 capabilities that
 * previously had none.
 */
class UsageEngine {
  canConsume(capability: Exclude<UsageCapability, 'aiReasoning'>, amount = 1): UsageCheckResult {
    const tier = entitlementService.getEntitlements().tier;
    if (usageQuotaConfigStore.isPooled(tier)) {
      return { allowed: true, pooled: true, deferTo: 'organizationUsageService' };
    }

    const seatTier = entitlementService.getSeatTier();
    const limit = usageQuotaConfigStore.getEffectiveQuota(tier, seatTier, capability);
    if (limit === null) return { allowed: true, pooled: false };

    const { usedThisPeriod } = usageStore.getUsage(capability);
    if (usedThisPeriod + amount > limit) {
      return { allowed: false, pooled: false, reason: `${capability} usage limit reached (${usedThisPeriod}/${limit} this period)` };
    }
    return { allowed: true, pooled: false };
  }

  /** Only meaningful to call after canConsume() returned {allowed: true, pooled: false} — recording usage for a pooled tier here would be silently wrong (the real counter lives in Supabase), so this is a no-op for pooled tiers rather than double-counting. */
  recordUsage(capability: Exclude<UsageCapability, 'aiReasoning'>, amount = 1): void {
    const tier = entitlementService.getEntitlements().tier;
    if (usageQuotaConfigStore.isPooled(tier)) return;
    usageStore.record(capability, amount);
  }

  /** One combined view across all 8 capabilities — merges CreditStore's real aiReasoning numbers with this engine's own 7 tracked capabilities, so a future usage dashboard has a single source to read instead of stitching two APIs together itself. */
  getUnifiedUsageSummary(): CapabilityUsageSummary[] {
    const tier = entitlementService.getEntitlements().tier;
    const seatTier = entitlementService.getSeatTier();
    const pooled = usageQuotaConfigStore.isPooled(tier);

    const aiReasoningSummary: CapabilityUsageSummary = (() => {
      const balance = creditStore.getBalance();
      const limit = entitlementService.getCreditLimit();
      return { capability: 'aiReasoning', limit, used: balance.usedThisPeriod, periodResetsAt: balance.periodResetsAt, pooled: false };
    })();

    const trackedSummaries: CapabilityUsageSummary[] = TRACKED_USAGE_CAPABILITIES.map((capability) => {
      const limit = pooled ? usageQuotaConfigStore.getEffectiveQuota(tier, seatTier, capability) : usageQuotaConfigStore.getEffectiveQuota(tier, seatTier, capability);
      const { usedThisPeriod, periodResetsAt } = usageStore.getUsage(capability);
      // Pooled tiers' real `used` figure lives in Supabase (organization_usage_counters), not this
      // local store — reporting the local (always-zero-for-pooled-tiers-in-practice) counter here
      // would be misleading, so pooled summaries report used: 0 with pooled: true as an honest
      // signal to fetch the real number from organizationUsageService.getSummary() instead.
      return { capability, limit, used: pooled ? 0 : usedThisPeriod, periodResetsAt, pooled };
    });

    return [aiReasoningSummary, ...trackedSummaries];
  }
}

export const usageEngine = new UsageEngine();
