import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rollingUsageGate } from './RollingUsageGate';
import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { subscriptionStore } from './SubscriptionStore';
import { buildAccessStore } from './BuildAccessStore';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';
import type { SubscriptionState } from '../../shared/billing/BillingTypes';

function makeRecord(overrides: Partial<NormalizedUsageRecord>): NormalizedUsageRecord {
  return {
    requestId: 'req-' + Math.random(),
    runId: null,
    modelId: 'models/gemini-1.5-pro-latest',
    pawModelId: 'paw-expert',
    fable: false,
    timestamp: Date.now(),
    requestType: 'conversationTurn',
    inputTokens: 100,
    outputTokens: 50,
    activeDurationMs: 0,
    normalizedCompute: (1) * 10,
    billedTo: 'pro',
    ...overrides,
  };
}

describe('RollingUsageGate - Fixed Cycles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usageEventStore.getWeeklyCycleStartAt = vi.fn().mockReturnValue(Date.now() - 100000);
    usageEventStore.getActiveWindowStartAt = vi.fn().mockReturnValue(Date.now() - 50000);
    usageEventStore.advanceActiveWindow = vi.fn();
    
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({
      tier: 'pro',
      status: 'active',
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    buildAccessStore.clear();
  });

  describe('PRO', () => {
    // Window semantics (commit 406663d, confirmed as the product rule): reaching the 5-hour
    // active-time cap BLOCKS until the fixed 5-hour window ends — it never opens a new window early.
    it('1 & 2. Reaching the 5h active-time cap blocks until the window resets, even with weekly capacity left', () => {
      const now = Date.now();
      // 5 active hours consumed exactly inside the current window
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
      expect(usageEventStore.advanceActiveWindow).not.toHaveBeenCalled();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('5-hour active-use limit reached');
    });

    it('3. Renewal does not reset weekly usage', () => {
      const now = Date.now();
      // Test that sumSince is called correctly with weekly start
      // Since it's internal to the gate, we verify via the final usage returned
      // (advanceActiveWindow is called, meaning window resets, but weekly should stay at 5h)
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
      expect(result.usage.activeHoursUsed7d).toBe(5);
    });

    it('4. 20h weekly limit blocks further included usage', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 20 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('5. Renewing the 5h window cannot bypass 20h weekly limit', () => {
       const now = Date.now();
       vi.spyOn(usageEventStore, 'list').mockReturnValue([
         makeRecord({ activeDurationMs: 20 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
       ]);
       // Even if window start was reset, the weekly limit check runs first
       const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
       expect(result.allowed).toBe(false);
       expect(usageEventStore.advanceActiveWindow).not.toHaveBeenCalled();
    });

    it('6. Weekly boundary restores weekly capacity', () => {
      const now = Date.now();
      // Mock weekly cycle start to be in the present, while record is in the past week
      usageEventStore.getWeeklyCycleStartAt = vi.fn().mockReturnValue(now);
      
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 20 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 10000 }) // Old record
      ]);
      
      const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
      expect(result.allowed).toBe(true);
      expect(result.usage.activeHoursUsed7d).toBe(0);
    });

    it('7. Purchased credits remain separate', () => {
       // Handled upstream in EntitlementService, gate accurately reports false for included
       const now = Date.now();
       vi.spyOn(usageEventStore, 'list').mockReturnValue([
         makeRecord({ activeDurationMs: 20 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
       ]);
       const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
       expect(result.allowed).toBe(false);
    });
  });

  describe('PRO MAX', () => {
    it('8. 5h active-time cap blocks until the window resets', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(usageEventStore.advanceActiveWindow).not.toHaveBeenCalled();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('5-hour active-use limit reached');
    });

    it('8b. Once the fixed 5h window has passed, the same usage no longer blocks', () => {
      const now = Date.now();
      // Window started after the record (i.e. the previous window ended) — the record is last window's usage.
      usageEventStore.getActiveWindowStartAt = vi.fn().mockReturnValue(now - 1000);
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 60_000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result.allowed).toBe(true);
      expect(result.usage.activeHoursUsed7d).toBe(5);
    });

    it('9. 30h variant respects 30h weekly limit', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 30 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result.allowed).toBe(false);
      
      // But 29h this week (used in earlier windows, not the current one) is allowed
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 29 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 60_000 })
      ]);
      const result2 = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result2.allowed).toBe(true);
    });

    it('10. 40h variant respects 40h weekly limit', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 40 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '20x');
      expect(result.allowed).toBe(false);
    });

    it('11. Window renewal does not reset weekly usage', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result.usage.activeHoursUsed7d).toBe(5);
    });

    it('12. Weekly boundary resets correctly', () => {
      const now = Date.now();
      usageEventStore.getWeeklyCycleStartAt = vi.fn().mockReturnValue(now);
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 30 * 60 * 60 * 1000, timestamp: now - 10000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result.allowed).toBe(true);
    });
  });

  describe('BUILD', () => {
    const HOUR = 60 * 60 * 1000;
    const WEEK = 7 * 24 * HOUR;
    // Build access is server-confirmed and memory-only (BuildAccessStore); the gate anchors Build's
    // weekly cycle to the grant start.
    const grant = (startsAt: number, endsAt = startsAt + 61 * 24 * HOUR) =>
      buildAccessStore.set({ status: 'active', cohortId: 'test', startsAt, endsAt, revokedAt: null, syncedAt: Date.now() });

    beforeEach(() => {
      grant(Date.now() - 100000);
    });

    it('12. Capacity is 500 PC / 5h, 1,500 PC / week, 5 h / 5h, 15 h / week', () => {
      const result = rollingUsageGate.canStartGeneration('build', undefined, Date.now());
      expect(result.usage.limit5h).toBe(500);
      expect(result.usage.limit7d).toBe(1500);
      expect(result.usage.activeHours5h).toBe(5);
      expect(result.usage.activeHours7d).toBe(15);
    });

    it('12b. Below every limit is allowed', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([makeRecord({ normalizedCompute: (499) * 10, activeDurationMs: 4 * HOUR, timestamp: now - 1000 })]);
      expect(rollingUsageGate.canStartGeneration('build', undefined, now).allowed).toBe(true);
    });

    it('13. 1,500 PC weekly limit is enforced', () => {
      const now = Date.now();
      // Used in earlier windows of this week, so only the weekly cap can be what blocks.
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (1500) * 10, activeDurationMs: 0, timestamp: now - 60_000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('13b. 500 PC per 5-hour window is enforced while weekly capacity remains', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([makeRecord({ normalizedCompute: (500) * 10, activeDurationMs: 0, timestamp: now - 1000 })]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('5-hour Paw Compute limit reached');
      expect(result.usage.usage7d).toBe(500); // the window's 500 PC is part of the 1,500 weekly total
    });

    it('14 & 15. 5 active hours in a 5-hour window blocks until that window resets', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 5 * HOUR, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(usageEventStore.advanceActiveWindow).not.toHaveBeenCalled();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('5-hour active-use limit reached');
    });

    it('16. Weekly active usage accumulates across windows', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 5 * HOUR, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.usage.activeHoursUsed7d).toBe(5);
    });

    it('17. 15h weekly active-time limit blocks included usage', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 15 * HOUR, timestamp: now - 60_000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('18. A new 5-hour window cannot bypass the 15h weekly limit', () => {
      const now = Date.now();
      usageEventStore.getActiveWindowStartAt = vi.fn().mockReturnValue(now - 1000);
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 15 * HOUR, timestamp: now - 60_000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('19. Build weeks are anchored to the grant start: last week\'s usage no longer counts', () => {
      const now = Date.now();
      grant(now - WEEK); // exactly one week ago → a new Build week starts now
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (1500) * 10, activeDurationMs: 15 * HOUR, timestamp: now - WEEK + 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(true);
      expect(result.usage.usage7d).toBe(0);
      expect(result.usage.weekResetsAt).toBe(now + WEEK);
    });

    it('20. The 5-hour window never reaches back into the previous Build week', () => {
      const now = Date.now();
      grant(now - WEEK - 60_000); // new week began 60s ago
      usageEventStore.getActiveWindowStartAt = vi.fn().mockReturnValue(now - 2 * HOUR); // window began in last week
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (500) * 10, activeDurationMs: 0, timestamp: now - HOUR }) // last week, same window
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(true);
      expect(result.usage.usage5h).toBe(0);
    });

    it('21. Autonomous-run records (runId) are excluded from Build usage — Build cannot start them', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (1500) * 10, activeDurationMs: 15 * HOUR, runId: 'auto-123', timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(true);
      expect(result.usage.usage7d).toBe(0);
    });

    it('21b. Background tasks and Paw Fable never count toward Build limits', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (1500) * 10, requestType: 'backgroundTask', timestamp: now - 1000 }),
        makeRecord({ normalizedCompute: (1500) * 10, fable: true, timestamp: now - 1000 }),
      ]);
      expect(rollingUsageGate.canStartGeneration('build', undefined, now).allowed).toBe(true);
    });
  });

  describe('GO REGRESSION', () => {
    it('22, 23, 24, 25. Go remains 1,000 PC, 14-day cycle, unaffected by Pro changes', () => {
      const now = Date.now();
      usageEventStore.getGoCycleStatus = vi.fn().mockReturnValue({ cycleStartAt: now - 10000, refreshesUsed: 0 });
      usageEventStore.getLastGoRefreshAt = vi.fn().mockReturnValue(undefined);
      
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: (1000) * 10, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('go', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.usage.limit7d).toBe(1000); // represents the 14-day PC limit for Go
    });
  });
});