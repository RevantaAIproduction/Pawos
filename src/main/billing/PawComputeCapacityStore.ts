import type { EffectiveTierId, SeatTier } from '../../shared/billing/BillingTypes';

export type TierRollingCapacity = {
  /** Max Paw Compute allowed in any rolling 5-hour window. null = no 5-hour cap. */
  window5hPc: number | null;
  /** Max Paw Compute allowed in any rolling week (7-day window). null = no weekly cap. */
  windowWeeklyPc: number | null;
  /** Max active hours allowed in any rolling 5-hour window. null = no 5-hour cap. */
  window5hActiveHours: number | null;
  /** Max active hours allowed in any rolling week. null = no weekly cap. */
  windowWeeklyActiveHours: number | null;
  /** True only for Enterprise — enforcement deferred to the organization pool in Supabase. */
  pooled: boolean;
};

export type CapacityTierKey = 'go' | 'pro' | 'proMax' | 'team' | 'teamPremium' | 'enterprise' | 'build';

export type RollingCapacityConfig = {
  /** Config schema version for migration (current = 4) */
  version?: number;
  /** 'team' = Team Standard per-seat; 'teamPremium' = Team Premium per-seat. */
  tiers: Record<CapacityTierKey, TierRollingCapacity>;
};

const CURRENT_CONFIG_VERSION = 4;

function defaultConfig(): RollingCapacityConfig {
  return {
    version: CURRENT_CONFIG_VERSION,
    tiers: {
      go:          { window5hPc: 1_000,       windowWeeklyPc: 1_000,  window5hActiveHours: null, windowWeeklyActiveHours: 5,   pooled: false },
      pro:         { window5hPc: 1_250,       windowWeeklyPc: 5_000,  window5hActiveHours: 5,    windowWeeklyActiveHours: 20,  pooled: false },
      proMax:      { window5hPc: 4_166.6667,  windowWeeklyPc: 25_000, window5hActiveHours: 5,    windowWeeklyActiveHours: 30,  pooled: false }, // 5x variant; 20x is 100k/40h
      team:        { window5hPc: 1_250,       windowWeeklyPc: 5_000,  window5hActiveHours: null, windowWeeklyActiveHours: 20,  pooled: true  }, // Handled server-side usually, but defining limits here
      teamPremium: { window5hPc: 4_166.6667,  windowWeeklyPc: 25_000, window5hActiveHours: null, windowWeeklyActiveHours: 30,  pooled: true  },
      enterprise:  { window5hPc: null,    windowWeeklyPc: null,   window5hActiveHours: null, windowWeeklyActiveHours: null, pooled: true  },
      // PawOS Build (admin-granted student tier): 1,500 PC per week in total, of which at most 500 PC
      // may be used inside any one 5-hour window — the window cap is part of the weekly total, not extra.
      build:       { window5hPc: 500,     windowWeeklyPc: 1_500,  window5hActiveHours: 5,    windowWeeklyActiveHours: 15,  pooled: false },
    },
  };
}

class PawComputeCapacityStore {
  private config: RollingCapacityConfig = defaultConfig();

  /**
   * Limits are program terms, not user settings: always the built-in defaults. Earlier builds read
   * them back from a paw-compute-capacity.json in the user's data folder — anyone could edit that file
   * to raise their own limits — so no file is read (or written) any more.
   */
  init(): void {
    this.config = defaultConfig();
  }

  get(): RollingCapacityConfig {
    return this.config;
  }

  resolve(tier: EffectiveTierId, seatTier?: SeatTier, proMaxVariant?: '5x' | '20x'): TierRollingCapacity {
    let key: CapacityTierKey =
      tier === 'team' && seatTier === 'premium' ? 'teamPremium' : (tier as CapacityTierKey);

    // Build's limits are fixed program terms, not tunable config: always the code defaults, never a
    // value read back from the user-writable paw-compute-capacity.json.
    if (key === 'build') return defaultConfig().tiers.build;

    let capacity =
      this.config.tiers[key] ??
      defaultConfig().tiers[key as CapacityTierKey] ??
      { window5hPc: null, windowWeeklyPc: null, window5hActiveHours: null, windowWeeklyActiveHours: null, pooled: false };

    // Apply 20x scaling for Pro Max (config holds 5x base)
    if (tier === 'proMax' && proMaxVariant === '20x') {
      capacity = {
        ...capacity,
        windowWeeklyPc: (capacity.windowWeeklyPc ?? 0) * 4,
        window5hPc: 12_500,
        windowWeeklyActiveHours: 40 // 40h for 20x
      };
    }

    return capacity;
  }

  /** Remote-sync override (in memory only) — same pattern as PawComputeConfigStore.applySyncedConfig(). */
  applySyncedConfig(config: RollingCapacityConfig): void {
    const defaults = defaultConfig();
    this.config = { version: CURRENT_CONFIG_VERSION, tiers: { ...defaults.tiers, ...config.tiers } };
  }
}

export const pawComputeCapacityStore = new PawComputeCapacityStore();
