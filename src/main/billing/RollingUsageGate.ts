import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { subscriptionStore } from './SubscriptionStore';
import type { SubscriptionTierId, SeatTier, ProMaxVariant } from '../../shared/billing/BillingTypes';
import type { RollingUsageSummary, GenerationCheckResult } from '../../shared/billing/UsageEngineTypes';

const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
const WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;

class RollingUsageGate {
  private readonly inflightTimers: NodeJS.Timeout[] = [];
  private readonly SLOT_TIMEOUT_MS = 60_000;

  reserveSlot(): void {
    const timer = setTimeout(() => {
      const idx = this.inflightTimers.indexOf(timer);
      if (idx !== -1) this.inflightTimers.splice(idx, 1);
    }, this.SLOT_TIMEOUT_MS);
    this.inflightTimers.push(timer);
  }

  releaseSlot(): void {
    const timer = this.inflightTimers.pop();
    if (timer !== undefined) clearTimeout(timer);
  }

  get inflightCount(): number { return this.inflightTimers.length; }

  private sumSince(cutoff: number, tier: SubscriptionTierId | 'build'): { pc: number; activeMs: number } {
    let totalPc = 0;
    let totalActiveMs = 0;
    for (const record of usageEventStore.list()) {
      if (record.fable) continue;
      if (record.requestType === 'backgroundTask') continue;
      
      const isBuild = tier === 'build';
      if (!isBuild && record.runId) continue;
      
      if (record.timestamp >= cutoff) {
        totalPc += record.normalizedCompute;
        totalActiveMs += (record.activeDurationMs ?? 0);
      }
    }
    return {
      pc: Math.round(totalPc * 10_000) / 10_000,
      activeMs: totalActiveMs,
    };
  }

  getRollingUsage(tier: SubscriptionTierId | 'build', seatTier?: SeatTier, now = Date.now(), proMaxVariant?: '5x' | '20x'): RollingUsageSummary {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier, proMaxVariant);
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    let weeklyStart = now - WEEK_MS;
    
    if (tier === 'go') {
      weeklyStart = usageEventStore.getGoCycleStatus(now).cycleStartAt;
      const lastRefresh = usageEventStore.getLastGoRefreshAt();
      if (lastRefresh) weeklyStart = Math.max(weeklyStart, lastRefresh);
    } else if (tier === 'build') {
      const buildEnt = subscriptionStore.getEffective().buildEntitlement;
      if (buildEnt?.cohortStartDate) {
        const weeksSince = Math.floor(Math.max(0, now - buildEnt.cohortStartDate) / WEEK_MS);
        weeklyStart = buildEnt.cohortStartDate + weeksSince * WEEK_MS;
      } else {
        weeklyStart = usageEventStore.getWeeklyCycleStartAt(now);
      }
    } else {
      weeklyStart = usageEventStore.getWeeklyCycleStartAt(now);
    }

    let windowStart = tier === 'go' ? (now - WINDOW_5H_MS) : usageEventStore.getActiveWindowStartAt();
    windowStart = Math.max(windowStart, weeklyStart);

    const sumWeekly = this.sumSince(weeklyStart, tier);
    const sumWindow = this.sumSince(windowStart, tier);

    return {
      usage5h: sumWindow.pc,
      limit5h: capacity.window5hPc,
      usage7d: sumWeekly.pc,
      limit7d: capacity.windowWeeklyPc,
      activeHoursUsed5h: sumWindow.activeMs / (1000 * 60 * 60),
      activeHours5h: capacity.window5hActiveHours,
      activeHoursUsed7d: sumWeekly.activeMs / (1000 * 60 * 60),
      activeHours7d: capacity.windowWeeklyActiveHours,
    };
  }

  canStartGeneration(tier: SubscriptionTierId | 'build', seatTier?: SeatTier, now = Date.now(), proMaxVariant?: '5x' | '20x'): GenerationCheckResult {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier, proMaxVariant);

    if (capacity.pooled) {
      return { allowed: true, pooled: true, deferTo: 'organizationUsageService', usage: this.getRollingUsage(tier, seatTier, now, proMaxVariant) };
    }

    if (this.inflightCount > 0) {
      return { allowed: false, pooled: false, reason: 'inflight', usage: this.getRollingUsage(tier, seatTier, now, proMaxVariant) };
    }

    let usage = this.getRollingUsage(tier, seatTier, now, proMaxVariant);

    if (capacity.windowWeeklyPc !== null && usage.usage7d >= capacity.windowWeeklyPc) {
      return { allowed: false, pooled: false, reason: "Weekly limit reached\nYour included Paw Compute for this week has been used.\nWait for your weekly reset or purchase Compute Credits to continue.", usage };
    }

    if (capacity.windowWeeklyActiveHours !== null && usage.activeHoursUsed7d >= capacity.windowWeeklyActiveHours) {
      return { allowed: false, pooled: false, reason: "Weekly limit reached\nYour included active hours for this week have been used.\nWait for your weekly reset or purchase Compute Credits to continue.", usage };
    }

    if (capacity.window5hPc !== null && usage.usage5h >= capacity.window5hPc) {
      return { allowed: false, pooled: false, reason: "5-hour Paw Compute limit reached (" + usage.usage5h.toFixed(2) + " / " + capacity.window5hPc + " PC)", usage };
    }

    if (capacity.window5hActiveHours !== null && usage.activeHoursUsed5h >= capacity.window5hActiveHours) {
      usageEventStore.advanceActiveWindow(now);
      usage = this.getRollingUsage(tier, seatTier, now, proMaxVariant);
    }

    return { allowed: true, pooled: false, usage };
  }
}

export const rollingUsageGate = new RollingUsageGate();