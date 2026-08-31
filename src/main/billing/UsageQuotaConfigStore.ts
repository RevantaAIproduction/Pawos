import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';
import { TRACKED_USAGE_CAPABILITIES } from '../../shared/billing/UsageEngineTypes';
import type { CapabilityQuotaConfig, UsageCapability, UsageQuotaConfig, UsageQuotaTierKey } from '../../shared/billing/UsageEngineTypes';

const FILE_NAME = 'usage-quota-config.json';

/** Builds the 7 tracked-capability entries at a flat limit; 'aiReasoning' is always set separately per tier since its number never matches the other 7's (see defaultConfig()). */
function flatQuota(limit: number | null): Record<Exclude<UsageCapability, 'aiReasoning'>, CapabilityQuotaConfig> {
  const out = {} as Record<Exclude<UsageCapability, 'aiReasoning'>, CapabilityQuotaConfig>;
  for (const capability of TRACKED_USAGE_CAPABILITIES) out[capability] = { monthlyLimit: limit, weeklyLimit: null };
  return out;
}

/**
 * The main process's config-driven Usage & Entitlement Engine quota table —
 * mirrors supabase/migrations/20260730010000_usage_engine.sql's
 * usage_quota_config seed exactly (see that file's comment for why: the
 * canonical, admin-editable source of truth lives in Supabase so both the
 * Electron app and the pooled-Enterprise RPC can agree on the same numbers,
 * but the Electron main process has no Supabase session of its own —
 * renderer services do, per this codebase's established direct-Supabase
 * convention — so this store is a synced CACHE, not a second authority.
 * applySyncedConfig() overwrites these placeholder defaults once the
 * renderer has fetched the real table via IPC; until then, the numbers here
 * are provisional ("Business Configuration Required," the same discipline
 * every other placeholder business number in this codebase already follows)
 * and are kept in sync with the migration's seed by hand — update both
 * together.
 *
 * 'aiReasoning' (Paw Compute's conversation-turn capability) is configured
 * here exactly like the other 7 — this is the single source
 * EntitlementService.getCreditLimit() reads from, replacing the old static
 * per-tier monthlyCreditLimit literals (null for every paid tier). Its own
 * usage COUNTER still lives in CreditStore (non-pooled tiers) / the pooled
 * Enterprise RPC (organization_usage_counters) — see UsageEngineTypes.ts's
 * doc comment on TRACKED_USAGE_CAPABILITIES for why the counter and the
 * limit-configuration live in different places on purpose.
 */
function defaultConfig(): UsageQuotaConfig {
  return {
    tiers: {
      go: { tier: 'go', perUserQuotas: { ...flatQuota(0), aiReasoning: { monthlyLimit: 200, weeklyLimit: 50 } }, pooled: false },
      pro: {
        tier: 'pro',
        perUserQuotas: {
          // Weekly cap alongside the existing monthly one — both enforced independently, whichever
          // binds first blocks further usage. 500/week is real, user-specified (not a placeholder).
          aiReasoning: { monthlyLimit: 2000, weeklyLimit: 500 },
          repositoryAnalysis: { monthlyLimit: 200, weeklyLimit: null },
          websiteAnalysis: { monthlyLimit: 200, weeklyLimit: null },
          codeExecution: { monthlyLimit: 500, weeklyLimit: null },
          browserAutomation: { monthlyLimit: 300, weeklyLimit: null },
          desktopAutomation: { monthlyLimit: 300, weeklyLimit: null },
          longRunningWorkflow: { monthlyLimit: 50, weeklyLimit: null },
          autonomousExecution: { monthlyLimit: 20, weeklyLimit: null },
        },
        pooled: false,
      },
      proMax: {
        tier: 'proMax',
        // Never populated directly (including aiReasoning) — see derivedFrom below and getEffectiveQuota().
        perUserQuotas: { ...flatQuota(null), aiReasoning: { monthlyLimit: null, weeklyLimit: null } },
        pooled: false,
        // Monthly stays 20x Pro; weekly is a deliberately different 10x ratio (Pro Max: 10,000/week —
        // real, user-specified), so weeklyMultiplier is set explicitly rather than reusing multiplier.
        derivedFrom: { tier: 'pro', multiplier: 20, weeklyMultiplier: 10 },
      },
      team: {
        tier: 'team',
        perUserQuotas: {
          aiReasoning: { monthlyLimit: 2000, weeklyLimit: 500 },
          repositoryAnalysis: { monthlyLimit: 2000, weeklyLimit: null },
          websiteAnalysis: { monthlyLimit: 2000, weeklyLimit: null },
          codeExecution: { monthlyLimit: 2000, weeklyLimit: null },
          browserAutomation: { monthlyLimit: 2000, weeklyLimit: null },
          desktopAutomation: { monthlyLimit: 2000, weeklyLimit: null },
          longRunningWorkflow: { monthlyLimit: 2000, weeklyLimit: null },
          autonomousExecution: { monthlyLimit: 2000, weeklyLimit: null },
        },
        pooled: false,
      },
      teamPremium: {
        tier: 'teamPremium',
        perUserQuotas: {
          aiReasoning: { monthlyLimit: 10000, weeklyLimit: 2500 },
          repositoryAnalysis: { monthlyLimit: 10000, weeklyLimit: null },
          websiteAnalysis: { monthlyLimit: 10000, weeklyLimit: null },
          codeExecution: { monthlyLimit: 10000, weeklyLimit: null },
          browserAutomation: { monthlyLimit: 10000, weeklyLimit: null },
          desktopAutomation: { monthlyLimit: 10000, weeklyLimit: null },
          longRunningWorkflow: { monthlyLimit: 10000, weeklyLimit: null },
          autonomousExecution: { monthlyLimit: 10000, weeklyLimit: null },
        },
        pooled: false,
      },
      enterprise: {
        // informational only (all null-flagged) — enterprise is pooled, see organization_usage_counters.
        // The real enforced pooled aiReasoning number (50000/month) lives in the matching Supabase
        // usage_quota_config row, read directly by increment_organization_usage().
        tier: 'enterprise',
        perUserQuotas: { ...flatQuota(null), aiReasoning: { monthlyLimit: null, weeklyLimit: null } },
        pooled: true,
      },
    },
  };
}

/** Team Standard and Team Premium share one SubscriptionTierId ('team') distinguished by SeatTier — see UsageQuotaTierKey's doc comment in UsageEngineTypes.ts. */
function mergeMissingQuotaDefaults(config: UsageQuotaConfig): UsageQuotaConfig {
  const defaults = defaultConfig();
  const tiers = { ...config.tiers };

  for (const key of Object.keys(defaults.tiers) as UsageQuotaTierKey[]) {
    const current = tiers[key];
    const fallback = defaults.tiers[key];
    if (!current) {
      tiers[key] = fallback;
      continue;
    }

    const perUserQuotas = {
      ...fallback.perUserQuotas,
      ...(current.perUserQuotas ?? {}),
    };
    for (const capability of Object.keys(fallback.perUserQuotas) as UsageCapability[]) {
      if (perUserQuotas[capability] === undefined) perUserQuotas[capability] = fallback.perUserQuotas[capability];
    }

    tiers[key] = {
      ...fallback,
      ...current,
      perUserQuotas,
      pooled: current.pooled ?? fallback.pooled,
      derivedFrom: current.derivedFrom ?? fallback.derivedFrom,
    };
  }

  return { tiers };
}

export function resolveQuotaTierKey(tier: SubscriptionTierId, seatTier: SeatTier | undefined): UsageQuotaTierKey {
  if (tier === 'team' && seatTier === 'premium') return 'teamPremium';
  return tier;
}

class UsageQuotaConfigStore {
  private file = '';
  private config: UsageQuotaConfig = defaultConfig();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      this.config = mergeMissingQuotaDefaults(JSON.parse(fs.readFileSync(this.file, 'utf-8')) as UsageQuotaConfig);
      this.save();
    } catch {
      this.config = defaultConfig();
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): UsageQuotaConfig {
    return this.config;
  }

  /** Called once the renderer has fetched the real usage_quota_config table from Supabase — replaces the placeholder cache with the live, admin-editable numbers. */
  applySyncedConfig(config: UsageQuotaConfig): void {
    this.config = mergeMissingQuotaDefaults(config);
    this.save();
  }

  /**
   * Resolves the effective limit for (tier, seatTier, capability, cadence),
   * following Pro Max's derivedFrom multiplier (or weeklyMultiplier, for the
   * weekly cadence) at read time rather than ever reading a second
   * hardcoded Pro Max number. Accepts the full UsageCapability union
   * (including 'aiReasoning') — this is the single config-resolution
   * function both UsageEngine (the 7 tracked execution capabilities) and
   * EntitlementService.getCreditLimit()/getWeeklyCreditLimit()
   * ('aiReasoning') call into. Defaults to 'monthly' so every pre-existing
   * caller (never passing a third argument) keeps its exact prior behavior.
   */
  getEffectiveQuota(
    tier: SubscriptionTierId,
    seatTier: SeatTier | undefined,
    capability: UsageCapability,
    cadence: 'monthly' | 'weekly' = 'monthly',
    proMaxVariant?: '5x' | '20x'
  ): number | null {
    const key = resolveQuotaTierKey(tier, seatTier);
    const tierConfig = this.config.tiers[key];
    if (!tierConfig) return null;
    if (tierConfig.derivedFrom) {
      const baseTierConfig = this.config.tiers[tierConfig.derivedFrom.tier];
      const baseQuota = baseTierConfig?.perUserQuotas[capability];
      const baseLimit = cadence === 'weekly' ? (baseQuota?.weeklyLimit ?? null) : (baseQuota?.monthlyLimit ?? null);
      if (baseLimit === null) return null;

      // For Pro Max, apply 5x or 20x multiplier based on variant
      let multiplier = tierConfig.derivedFrom.multiplier;
      if (tier === 'proMax' && proMaxVariant === '5x') {
        multiplier = cadence === 'weekly' ? 2.5 : 5; // 5x for monthly, 2.5x for weekly (half of 5x weekly multiplier would be ~2.5)
      } else if (cadence === 'weekly') {
        multiplier = tierConfig.derivedFrom.weeklyMultiplier ?? tierConfig.derivedFrom.multiplier;
      }

      return baseLimit * multiplier;
    }
    const quota = tierConfig.perUserQuotas[capability];
    return cadence === 'weekly' ? (quota?.weeklyLimit ?? null) : (quota?.monthlyLimit ?? null);
  }

  isPooled(tier: SubscriptionTierId): boolean {
    return this.config.tiers[tier]?.pooled ?? false;
  }
}

export const usageQuotaConfigStore = new UsageQuotaConfigStore();
