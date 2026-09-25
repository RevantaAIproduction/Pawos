import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { buildAccessStore } from './BuildAccessStore';
import { normalizedComputeToCustomerPc } from '../../shared/billing/CustomerPcCommercialModel';
import type { EffectiveTierId, SeatTier } from '../../shared/billing/BillingTypes';
import type { RollingUsageSummary, GenerationCheckResult } from '../../shared/billing/UsageEngineTypes';

export const WINDOW_5H_MS = 5 * 60 * 60 * 1000;
export const WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;
/** Paw Go's capacity cycle length — see UsageEventStore.getGoCycleStatus(). */
const GO_CYCLE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Hidden cap on code-file changes per individual tier: every file Paw creates counts 1, and every
 * edit to an existing file that changes 30+ lines counts 1 (again on each such edit). Go's cap is
 * per month; every other capped tier's is per week (Build's week is anchored to its grant). Never
 * shown to users as a file count — reaching it presents exactly like the Paw Compute limit. Counted
 * per usage ledger (device for free Go, account for paid and Build). null = no file cap (Team, Enterprise).
 */
export function resolveFileCap(tier: EffectiveTierId, proMaxVariant?: '5x' | '20x'): number | null {
  switch (tier) {
    case 'go':
      return 75;
    case 'build':
      return 155;
    case 'pro':
      return 225;
    case 'proMax':
      return proMaxVariant === '20x' ? 550 : 375;
    default:
      return null;
  }
}

export type LimitKind = 'weekPc' | 'weekHours' | 'windowPc' | 'windowHours';

/**
 * What a user is told when included capacity runs out. The hidden file cap reuses the
 * 'weekPc' wording, so it always reads as a Paw Compute limit. Guidance depends on the tier:
 * Go must upgrade or buy (no waiting); Build can buy or wait, except in its final week, where it
 * must upgrade to Pro; paid tiers can wait or buy.
 * `noFurtherReset`: Build only — the limit's next reset would fall at or after the grant's end, so
 * nothing resets; access simply ends (week 8, days 50–56, of a 56-day grant).
 */
export function limitReachedMessage(
  tier: EffectiveTierId,
  kind: LimitKind,
  usage?: { usage5h: number; limit5h: number | null },
  opts?: { noFurtherReset?: boolean },
): string {
  // Go's included capacity isn't a weekly allowance (its file cap is monthly), so its wording names no period.
  if (tier === 'go' && (kind === 'weekPc' || kind === 'weekHours')) {
    return 'Paw Compute limit reached\nYour included Paw Compute has been used.\nUpgrade your plan or buy Paw Compute to keep going.';
  }
  const headline =
    kind === 'weekPc' || kind === 'weekHours'
      ? 'Weekly limit reached'
      : kind === 'windowPc'
        ? `5-hour Paw Compute limit reached${usage && usage.limit5h !== null ? ` (${usage.usage5h.toFixed(2)} / ${usage.limit5h} PC)` : ''}`
        : '5-hour active-use limit reached';
  const weekly = kind === 'weekPc' || kind === 'weekHours';
  const detail =
    kind === 'weekPc' ? 'Your included Paw Compute for this week has been used.'
    : kind === 'weekHours' ? 'Your included active hours for this week have been used.'
    : kind === 'windowHours' ? 'You have used your active hours for this window.'
    : 'Your included Paw Compute for this window has been used.';
  const guidance =
    tier === 'go'
      ? 'Upgrade your plan or buy Paw Compute to keep going.'
      : tier === 'build'
        ? opts?.noFurtherReset
          ? 'This is the last week of your PawOS Build access, so it will not reset again. Upgrade to Pro to keep going.'
          : weekly
            ? 'Buy Paw Compute to keep going, or wait — it resets automatically at your weekly reset.'
            : 'Buy Paw Compute to keep going, or wait — it resets automatically when the window ends.'
        : weekly ? 'Wait for your weekly reset or buy Paw Compute to continue.' : 'Wait for the window to reset or buy Paw Compute to continue.';
  return `${headline}\n${detail}\n${guidance}`;
}

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

  /**
   * Sums interactive usage since `cutoff`. Excluded for every tier: Paw Fable (purchased-credit
   * funded), background tasks (classification/summaries PawOS runs on its own), and records carrying a
   * runId (autonomous engineering runs, billed separately through Ticket Balance — see
   * AutonomousTaskBillingService.ts). Build cannot start autonomous runs at all (no
   * autonomousTaskBilling), so the runId exclusion never hides Build usage.
   */
  private sumSince(cutoff: number): { pc: number; activeMs: number } {
    let totalPc = 0;
    let totalActiveMs = 0;
    for (const record of usageEventStore.list()) {
      if (record.fable) continue;
      if (record.requestType === 'backgroundTask') continue;
      if (record.runId) continue;

      if (record.timestamp >= cutoff) {
        // Limits are in customer Paw Compute — the same unit a purchase buys ($1 = 100 PC) — never
        // the raw metering unit (normalizedCompute, $1 of model cost = 1,000).
        totalPc += normalizedComputeToCustomerPc(record.normalizedCompute);
        totalActiveMs += (record.activeDurationMs ?? 0);
      }
    }
    return {
      pc: Math.round(totalPc * 10_000) / 10_000,
      activeMs: totalActiveMs,
    };
  }

  /** The current weekly capacity cycle for `tier` — shared by Paw Compute, active hours and the file cap. */
  private weeklyWindow(tier: EffectiveTierId, now: number): { weeklyStart: number; weekResetsAt: number } {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (tier === 'go') {
      // (A local "Go refresh" marker used to be able to move this start forward and wipe Go usage;
      // nothing legitimately set it, so it is no longer read.)
      const goCycleStart = usageEventStore.getGoCycleStatus(now).cycleStartAt;
      return { weeklyStart: goCycleStart, weekResetsAt: goCycleStart + GO_CYCLE_MS };
    }
    if (tier === 'build') {
      // Build weeks are anchored to the server-confirmed grant start. A grant is 56 days = 8 weeks:
      // weeks 1–7 (days 1–49) each reset; week 8 (days 50–56) ends with the grant — no reset after
      // it. (Should a grant ever not be a whole number of weeks, the leftover days join the last week
      // rather than forming a short extra one.) Without an active grant there is no Build week.
      const startsAt = buildAccessStore.getStartsAt();
      const endsAt = buildAccessStore.getEndsAt();
      if (startsAt === null) {
        const weeklyStart = usageEventStore.getWeeklyCycleStartAt(now);
        return { weeklyStart, weekResetsAt: weeklyStart + WEEK_MS };
      }
      const elapsedWeeks = Math.floor(Math.max(0, now - startsAt) / WEEK_MS);
      if (endsAt === null) {
        const weeklyStart = startsAt + elapsedWeeks * WEEK_MS;
        return { weeklyStart, weekResetsAt: weeklyStart + WEEK_MS };
      }
      const lastWeek = Math.max(0, Math.floor((endsAt - startsAt) / WEEK_MS) - 1);
      const week = Math.min(elapsedWeeks, lastWeek);
      const weeklyStart = startsAt + week * WEEK_MS;
      return { weeklyStart, weekResetsAt: week === lastWeek ? endsAt : weeklyStart + WEEK_MS };
    }
    const weeklyStart = usageEventStore.getWeeklyCycleStartAt(now);
    return { weeklyStart, weekResetsAt: weeklyStart + WEEK_MS };
  }

  /** Start of the current file-cap period: Go's monthly cycle, otherwise the tier's weekly cycle. */
  private fileCapPeriodStart(tier: EffectiveTierId, now: number): number {
    if (tier === 'go') return usageEventStore.getGoFileCapMonthStartAt(now);
    return this.weeklyWindow(tier, now).weeklyStart;
  }

  /** Counted code-file changes this period against the tier's cap (null cap = uncapped). Admin reporting only — never shown to users. */
  getFileCapUsage(tier: EffectiveTierId, now = Date.now(), proMaxVariant?: '5x' | '20x'): { used: number; cap: number | null } {
    return { used: usageEventStore.countFileChangesSince(this.fileCapPeriodStart(tier, now)), cap: resolveFileCap(tier, proMaxVariant) };
  }

  /** Whether the hidden code-file cap for `tier` is used up this period (active usage ledger). */
  isFileCapReached(tier: EffectiveTierId, now = Date.now(), proMaxVariant?: '5x' | '20x'): boolean {
    const cap = resolveFileCap(tier, proMaxVariant);
    if (cap === null) return false;
    return usageEventStore.countFileChangesSince(this.fileCapPeriodStart(tier, now)) >= cap;
  }

  /**
   * Whether a code-file change may proceed under the file cap. Changes that don't count
   * (an edit under the line threshold) are always allowed; a counted one needs a free unit.
   */
  canMakeFileChange(tier: EffectiveTierId, counted: boolean, now = Date.now(), proMaxVariant?: '5x' | '20x'): boolean {
    if (!counted) return true;
    return !this.isFileCapReached(tier, now, proMaxVariant);
  }

  /**
   * PawOS Build's final week: the current week's reset would land at or after the grant's end (week
   * 8 = days 50–56 of a 56-day grant), so nothing resets. Purchases can't continue Build then — the only way
   * on is upgrading to Pro. False for any other tier.
   */
  isBuildFinalWeek(tier: EffectiveTierId, now = Date.now()): boolean {
    if (tier !== 'build') return false;
    const endsAt = buildAccessStore.getEndsAt();
    return endsAt !== null && this.weeklyWindow('build', now).weekResetsAt >= endsAt;
  }

  /** What a user sees when a counted code-file change hits the file cap (reads as the Paw Compute limit). */
  fileCapMessage(tier: EffectiveTierId, now = Date.now()): string {
    return limitReachedMessage(tier, 'weekPc', undefined, { noFurtherReset: this.isBuildFinalWeek(tier, now) });
  }

  getRollingUsage(tier: EffectiveTierId, seatTier?: SeatTier, now = Date.now(), proMaxVariant?: '5x' | '20x'): RollingUsageSummary {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier, proMaxVariant);
    const { weeklyStart, weekResetsAt } = this.weeklyWindow(tier, now);

    const fixedWindowStart = tier === 'go' ? null : usageEventStore.getActiveWindowStartAt(now);
    const windowStart = Math.max(fixedWindowStart ?? now - WINDOW_5H_MS, weeklyStart);

    const sumWeekly = this.sumSince(weeklyStart);
    const sumWindow = this.sumSince(windowStart);

    return {
      usage5h: sumWindow.pc,
      limit5h: capacity.window5hPc,
      usage7d: sumWeekly.pc,
      limit7d: capacity.windowWeeklyPc,
      activeHoursUsed5h: sumWindow.activeMs / (1000 * 60 * 60),
      activeHours5h: capacity.window5hActiveHours,
      activeHoursUsed7d: sumWeekly.activeMs / (1000 * 60 * 60),
      activeHours7d: capacity.windowWeeklyActiveHours,
      windowResetsAt: fixedWindowStart === null ? null : fixedWindowStart + WINDOW_5H_MS,
      weekResetsAt,
    };
  }

  /**
   * Checks all four rolling limits for `tier`, in order: weekly PC, weekly active hours, 5-hour PC,
   * 5-hour active hours. Any limit reached blocks the generation until that window/week boundary
   * passes — the 5-hour window is a fixed block (UsageEventStore.getActiveWindowStartAt; Go uses a
   * true rolling 5h), and reaching its cap does not open a new window early. The 5-hour window never
   * starts before the current week, so a window can never draw on a previous week's capacity.
   */
  canStartGeneration(tier: EffectiveTierId, seatTier?: SeatTier, now = Date.now(), proMaxVariant?: '5x' | '20x'): GenerationCheckResult {
    const capacity = pawComputeCapacityStore.resolve(tier, seatTier, proMaxVariant);

    if (capacity.pooled) {
      return { allowed: true, pooled: true, deferTo: 'organizationUsageService', usage: this.getRollingUsage(tier, seatTier, now, proMaxVariant) };
    }

    if (this.inflightCount > 0) {
      return { allowed: false, pooled: false, reason: 'inflight', usage: this.getRollingUsage(tier, seatTier, now, proMaxVariant) };
    }

    const usage = this.getRollingUsage(tier, seatTier, now, proMaxVariant);
    // PawOS Build: a limit whose reset lands at or after the grant's end never resets.
    const buildEndsAt = tier === 'build' ? buildAccessStore.getEndsAt() : null;
    const weekOpts = { noFurtherReset: buildEndsAt !== null && usage.weekResetsAt >= buildEndsAt };
    const windowOpts = { noFurtherReset: buildEndsAt !== null && usage.windowResetsAt !== null && usage.windowResetsAt >= buildEndsAt };

    if (capacity.windowWeeklyPc !== null && usage.usage7d >= capacity.windowWeeklyPc) {
      return { allowed: false, pooled: false, reason: limitReachedMessage(tier, 'weekPc', undefined, weekOpts), usage };
    }

    // Hidden code-file cap — presented exactly like the Paw Compute limit.
    if (this.isFileCapReached(tier, now, proMaxVariant)) {
      return { allowed: false, pooled: false, reason: limitReachedMessage(tier, 'weekPc', undefined, weekOpts), usage };
    }

    if (capacity.windowWeeklyActiveHours !== null && usage.activeHoursUsed7d >= capacity.windowWeeklyActiveHours) {
      return { allowed: false, pooled: false, reason: limitReachedMessage(tier, 'weekHours', undefined, weekOpts), usage };
    }

    if (capacity.window5hPc !== null && usage.usage5h >= capacity.window5hPc) {
      return { allowed: false, pooled: false, reason: limitReachedMessage(tier, 'windowPc', usage, windowOpts), usage };
    }

    if (capacity.window5hActiveHours !== null && usage.activeHoursUsed5h >= capacity.window5hActiveHours) {
      return { allowed: false, pooled: false, reason: limitReachedMessage(tier, 'windowHours', undefined, windowOpts), usage };
    }

    return { allowed: true, pooled: false, usage };
  }
}

export const rollingUsageGate = new RollingUsageGate();