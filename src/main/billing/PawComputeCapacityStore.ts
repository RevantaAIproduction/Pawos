import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';

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
  /** Config schema version for migration (current = 3) */
  version?: number;
  /** 'team' = Team Standard per-seat; 'teamPremium' = Team Premium per-seat. */
  tiers: Record<CapacityTierKey, TierRollingCapacity>;
};

const FILE_NAME = 'paw-compute-capacity.json';
const CURRENT_CONFIG_VERSION = 3;

function defaultConfig(): RollingCapacityConfig {
  return {
    version: CURRENT_CONFIG_VERSION,
    tiers: {
      go:          { window5hPc: null,    windowWeeklyPc: 1_000,  window5hActiveHours: null, windowWeeklyActiveHours: 5,   pooled: false },
      pro:         { window5hPc: null,    windowWeeklyPc: 5_000,  window5hActiveHours: null, windowWeeklyActiveHours: 20,  pooled: false },
      proMax:      { window5hPc: null,    windowWeeklyPc: 25_000, window5hActiveHours: null, windowWeeklyActiveHours: 30,  pooled: false }, // 5x variant; 20x is 100k/40h
      team:        { window5hPc: null,    windowWeeklyPc: 5_000,  window5hActiveHours: null, windowWeeklyActiveHours: 20,  pooled: true  }, // Handled server-side usually, but defining limits here
      teamPremium: { window5hPc: null,    windowWeeklyPc: 25_000, window5hActiveHours: null, windowWeeklyActiveHours: 30,  pooled: true  },
      enterprise:  { window5hPc: null,    windowWeeklyPc: null,   window5hActiveHours: null, windowWeeklyActiveHours: null, pooled: true  },
      build:       { window5hPc: null,    windowWeeklyPc: 1_500,  window5hActiveHours: 5,    windowWeeklyActiveHours: 15,  pooled: false },
    },
  };
}

class PawComputeCapacityStore {
  private file = '';
  private config: RollingCapacityConfig = defaultConfig();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const persisted = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<RollingCapacityConfig>;
      const defaults = defaultConfig();
      
      // Migration: if the persisted config is from an older version (e.g. version undefined/1),
      // discard the stale tier values (like the old Go 132 PC limit) and apply the new defaults.
      if (persisted.version !== CURRENT_CONFIG_VERSION) {
        this.config = defaults;
      } else {
        this.config = { version: CURRENT_CONFIG_VERSION, tiers: { ...defaults.tiers, ...(persisted.tiers ?? {}) } };
      }
      this.save();
    } catch {
      this.config = defaultConfig();
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  get(): RollingCapacityConfig {
    return this.config;
  }

  resolve(tier: SubscriptionTierId | 'build', seatTier?: SeatTier, proMaxVariant?: '5x' | '20x'): TierRollingCapacity {
    let key: CapacityTierKey =
      tier === 'team' && seatTier === 'premium' ? 'teamPremium' : (tier as CapacityTierKey);
    
    let capacity = 
      this.config.tiers[key] ??
      defaultConfig().tiers[key as CapacityTierKey] ??
      { window5hPc: null, windowWeeklyPc: null, window5hActiveHours: null, windowWeeklyActiveHours: null, pooled: false };

    // Apply 20x scaling for Pro Max (config holds 5x base)
    if (tier === 'proMax' && proMaxVariant === '20x') {
      capacity = {
        ...capacity,
        windowWeeklyPc: (capacity.windowWeeklyPc ?? 0) * 4,
        windowWeeklyActiveHours: 40 // 40h for 20x
      };
    }

    return capacity;
  }

  /** Remote-sync override — same pattern as PawComputeConfigStore.applySyncedConfig(). */
  applySyncedConfig(config: RollingCapacityConfig): void {
    const defaults = defaultConfig();
    this.config = { version: CURRENT_CONFIG_VERSION, tiers: { ...defaults.tiers, ...config.tiers } };
    this.save();
  }
}

export const pawComputeCapacityStore = new PawComputeCapacityStore();
