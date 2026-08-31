import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';

export type TierRollingCapacity = {
  /** Max Paw Compute allowed in any rolling 5-hour window. null = no 5-hour cap. */
  window5hPc: number | null;
  /** Max Paw Compute allowed in any rolling week (7-day window). null = no weekly cap. */
  windowWeeklyPc: number | null;
  /** True only for Enterprise — enforcement deferred to the organization pool in Supabase. */
  pooled: boolean;
};

export type CapacityTierKey = 'go' | 'pro' | 'proMax' | 'team' | 'teamPremium' | 'enterprise';

export type RollingCapacityConfig = {
  /** 'team' = Team Standard per-seat; 'teamPremium' = Team Premium per-seat. */
  tiers: Record<CapacityTierKey, TierRollingCapacity>;
};

const FILE_NAME = 'paw-compute-capacity.json';

/**
 * Approved capacity numbers (2026-08-19) — derived from real Gemini calibration on the live PawOS
 * conversation path with the full ~190-tool payload:
 *   cold request: 32.34 PC / $0.0323 USD
 *   warm request: 8.39 PC / $0.0084 USD (36,129 cached tokens)
 *   45-prompt session (1 cold + 44 warm): 401.5 PC / $0.401 USD
 *
 * Pro 5h = 400 PC (≈ 45 normal-equivalent prompts at blended 8.92 PC/prompt)
 * Pro weekly = 1,600 PC = 4 sessions × 400 PC
 *
 * All other tiers scale from Pro. Team/Enterprise limits are per-seat.
 *
 * KNOWN LIMITATION: the Gemini API key currently lives in the renderer process. A technically
 * sophisticated user who extracts the key could bypass this gate by calling Gemini directly. This
 * gate is the correct enforcement point within the current architecture — moving the key to the
 * main process is a separate, later hardening phase.
 */
function defaultConfig(): RollingCapacityConfig {
  return {
    tiers: {
      go:          { window5hPc: 10,    windowWeeklyPc: 50,     pooled: false },
      pro:         { window5hPc: 200,   windowWeeklyPc: 500,    pooled: false },
      proMax:      { window5hPc: 2_000, windowWeeklyPc: 10_000, pooled: false }, // 20x variant; 5x uses 1000/2500
      team:        { window5hPc: 200,   windowWeeklyPc: 500,    pooled: false },
      teamPremium: { window5hPc: 625,   windowWeeklyPc: 2_500,  pooled: false }, // Same as Pro Max 5x
      enterprise:  { window5hPc: 4_000, windowWeeklyPc: 16_000, pooled: true  },
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
      this.config = { tiers: { ...defaults.tiers, ...(persisted.tiers ?? {}) } };
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

  resolve(tier: SubscriptionTierId, seatTier?: SeatTier): TierRollingCapacity {
    const key: CapacityTierKey =
      tier === 'team' && seatTier === 'premium' ? 'teamPremium' : (tier as CapacityTierKey);
    return (
      this.config.tiers[key] ??
      defaultConfig().tiers[key as CapacityTierKey] ??
      { window5hPc: null, windowWeeklyPc: null, pooled: false }
    );
  }

  /** Remote-sync override — same pattern as PawComputeConfigStore.applySyncedConfig(). */
  applySyncedConfig(config: RollingCapacityConfig): void {
    const defaults = defaultConfig();
    this.config = { tiers: { ...defaults.tiers, ...config.tiers } };
    this.save();
  }
}

export const pawComputeCapacityStore = new PawComputeCapacityStore();
