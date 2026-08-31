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

  private sumInWindow(windowMs: number, now: number): number {
    const cutoff = now - windowMs;
    let total = 0;
    for (const record of usageEventStore.list()) {
      if (record.fable) continue;
      // Background (system) Gemini calls — transcription, file classification, session
      // classification, etc. — are reported with requestType='backgroundTask' and must NOT consume
      // the user's subscription rolling allowance. Only conversationTurn and toolContinuation
      // (the main chat loop's own requests) count against the user's quota.
      if (record.requestType === 'backgroundTask') continue;
      if (record.timestamp >= cutoff) total += record.normalizedCompute;
    }
    return Math.round(total * 10_000) / 10_000;
  }

  getRollingUsage(tier: SubscriptionTierId, seatTier?: SeatTier, now = Date.now()): RollingUsageSummary {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier);

    return {
      usage5h:  this.sumInWindow(WINDOW_5H_MS, now),
      limit5h:  capacity.window5hPc,
      usage7d:  this.sumInWindow(WINDOW_7D_MS, now),
      limit7d:  capacity.windowWeeklyPc,
    };
  }

  /**
   * Returns whether a new billable Gemini generation may start. Blocks if EITHER window is at or
   * above its limit. Both windows are checked independently; the stricter one wins. For pooled tiers
   * (Enterprise) the local gate always returns allowed=true and callers must go through
   * organizationUsageService instead.
   */
  canStartGeneration(tier: SubscriptionTierId, seatTier?: SeatTier, now = Date.now()): GenerationCheckResult {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier);
    const usage = this.getRollingUsage(tier, seatTier, now);

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
        reason: 'Another generation is already in progress — please wait for it to complete',
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

    return { allowed: true, pooled: false, usage };
  }
}

export const rollingUsageGate = new RollingUsageGate();
