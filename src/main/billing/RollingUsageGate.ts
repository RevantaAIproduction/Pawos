import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import type { SeatTier, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/** 5-hour rolling window in milliseconds. */
export const WINDOW_5H_MS = 5 * 60 * 60 * 1_000;
/** 7-day rolling window in milliseconds. */
export const WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1_000;

export type RollingUsageSummary = {
  usage5h: number;
  limit5h: number | null;
  usage7d: number;
  limit7d: number | null;
  activeHours5h: number | null;
  activeHours7d: number | null;
  activeHoursUsed5h: number;
  activeHoursUsed7d: number;
};

export type GenerationCheckResult =
  | { allowed: true;  pooled: false; usage: RollingUsageSummary }
  | { allowed: false; pooled: false; reason: string; usage: RollingUsageSummary }
  /** Enterprise is pooled — enforcement deferred to organizationUsageService (Supabase RPC). */
  | { allowed: true;  pooled: true;  deferTo: 'organizationUsageService'; usage: RollingUsageSummary };

/**
 * Rolling-window Paw Compute enforcement — the single, authoritative gate that decides whether a
 * new billable Gemini generation is allowed to start. Called from EntitlementService and the
 * billing:canStartGeneration IPC handler; never called from renderer code directly.
 *
 * The rolling window sums normalizedCompute from UsageEventStore — the same append-only ledger
 * UsageMeteringEngine writes after every real Gemini request. No separate counter exists; events
 * naturally leave the window as time passes, so there is no reset operation and no way to game the
 * boundary by timing a reset.
 *
 * Fable (paw-fable) usage is explicitly excluded from the rolling window: Fable is gated on
 * bonusThisPeriod (Paw Credits) and must not additionally consume the tier's included Paw Compute
 * allowance. Records with `fable: true` are set by the main process in billing:recordTurnUsage
 * when pawModelId === 'paw-fable', never by the renderer — the gate cannot be bypassed by a
 * renderer falsely claiming a request is Fable.
 */
class RollingUsageGate {
  /**
   * In-flight slot tracking for concurrency protection. When canStartGeneration() returns
   * allowed=true (non-pooled), the caller (billing:canStartGeneration IPC handler) reserves a slot
   * via reserveSlot(). Any subsequent canStartGeneration() call sees inflightCount > 0 and returns
   * allowed=false, preventing two simultaneous requests from both passing when only one has capacity.
   * Slots are released by billing:recordTurnUsage after real usage is recorded, or auto-released
   * after SLOT_TIMEOUT_MS if the Gemini call never completes (network failure, etc.).
   *
   * Node.js is single-threaded: the check-then-reserve sequence in the IPC handler is atomic —
   * no other handler runs between canStartGeneration() returning and reserveSlot() being called.
   */
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

  private sumInWindow(windowMs: number, now: number, isBuild = false): { pc: number; activeMs: number } {
    const cutoff = now - windowMs;
    let totalPc = 0;
    let totalActiveMs = 0;
    for (const record of usageEventStore.list()) {
      if (record.fable) continue;
      // Background (system) Gemini calls — transcription, file classification, session
      // classification, etc. — are reported with requestType='backgroundTask' and must NOT consume
      // the user's subscription rolling allowance. Only conversationTurn and toolContinuation
      // (the main chat loop's own requests) count against the user's quota.
      if (record.requestType === 'backgroundTask') continue;
      // Autonomous work is billed through a separate Ticket Balance wallet, not against
      // subscription Tier Compute quota. Autonomous usage is recorded with runId set to the
      // autonomous task ID; normal conversations have runId === null. Exclude autonomous
      // work from rolling limits to maintain quota separation.
      // Build tier only counts usage in the Build cohort (e.g. maybe separate runId logic later)
      // but standard tiers exclude autonomous tasks.
      if (!isBuild && record.runId !== null) continue;
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
    
    const sum5h = this.sumInWindow(WINDOW_5H_MS, now, tier === 'build');
    const sum7d = this.sumInWindow(WINDOW_7D_MS, now, tier === 'build');

    return {
      usage5h: sum5h.pc,
      limit5h: capacity.window5hPc,
      usage7d: sum7d.pc,
      limit7d: capacity.windowWeeklyPc,
      activeHoursUsed5h: sum5h.activeMs / (1000 * 60 * 60),
      activeHours5h: capacity.window5hActiveHours,
      activeHoursUsed7d: sum7d.activeMs / (1000 * 60 * 60),
      activeHours7d: capacity.windowWeeklyActiveHours,
    };
  }

  /**
   * Returns whether a new billable Gemini generation may start. Blocks if EITHER window is at or
   * above its limit. Both windows are checked independently; the stricter one wins. For pooled tiers
   * (Enterprise) the local gate always returns allowed=true and callers must go through
   * organizationUsageService instead.
   */
  canStartGeneration(tier: SubscriptionTierId | 'build', seatTier?: SeatTier, now = Date.now(), proMaxVariant?: '5x' | '20x'): GenerationCheckResult {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier, proMaxVariant);
    const usage = this.getRollingUsage(tier, seatTier, now, proMaxVariant);

    if (capacity.pooled) {
      return { allowed: true, pooled: true, deferTo: 'organizationUsageService', usage };
    }

    // Concurrency gate: block if another generation is already in-flight. This prevents two
    // simultaneous submits from both reading the same "under limit" snapshot and both proceeding,
    // which would let both through when only one has remaining capacity. The slot is reserved by
    // the billing:canStartGeneration IPC handler immediately after this method returns allowed=true,
    // and released by billing:recordTurnUsage once real usage is recorded (or auto-released on timeout).
    if (this.inflightCount > 0) {
      return {
        allowed: false,
        pooled: false,
        reason: 'inflight',
        usage,
      };
    }

    if (capacity.window5hPc !== null && usage.usage5h >= capacity.window5hPc) {
      return {
        allowed: false,
        pooled: false,
        reason: `5-hour Paw Compute limit reached (${usage.usage5h.toFixed(2)} / ${capacity.window5hPc} PC in the last 5 hours)`,
        usage,
      };
    }

    if (capacity.windowWeeklyPc !== null && usage.usage7d >= capacity.windowWeeklyPc) {
      return {
        allowed: false,
        pooled: false,
        reason: `Weekly Paw Compute limit reached (${usage.usage7d.toFixed(2)} / ${capacity.windowWeeklyPc} PC in the last 7 days)`,
        usage,
      };
    }
    
    if (capacity.window5hActiveHours !== null && usage.activeHoursUsed5h >= capacity.window5hActiveHours) {
      return {
        allowed: false,
        pooled: false,
        reason: `5-hour Active Time limit reached (${usage.activeHoursUsed5h.toFixed(2)} / ${capacity.window5hActiveHours} h in the last 5 hours)`,
        usage,
      };
    }

    if (capacity.windowWeeklyActiveHours !== null && usage.activeHoursUsed7d >= capacity.windowWeeklyActiveHours) {
      return {
        allowed: false,
        pooled: false,
        reason: `Weekly Active Time limit reached (${usage.activeHoursUsed7d.toFixed(2)} / ${capacity.windowWeeklyActiveHours} h in the last 7 days)`,
        usage,
      };
    }

    return { allowed: true, pooled: false, usage };
  }
}

export const rollingUsageGate = new RollingUsageGate();
