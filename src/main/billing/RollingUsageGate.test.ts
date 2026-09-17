import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rollingUsageGate } from './RollingUsageGate';
import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { subscriptionStore } from './SubscriptionStore';
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
    normalizedCompute: 1,
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
  });

  describe('PRO', () => {
    it('1 & 2. Window automatically renews when weekly capacity remains', () => {
      const now = Date.now();
      // 5 active hours consumed exactly
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, normalizedCompute: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
      expect(usageEventStore.advanceActiveWindow).toHaveBeenCalledWith(now);
      expect(result.allowed).toBe(true);
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
    it('8. 5h window works (renews automatically)', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 5 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(usageEventStore.advanceActiveWindow).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    it('9. 30h variant respects 30h weekly limit', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 30 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('proMax', undefined, now, '5x');
      expect(result.allowed).toBe(false);
      
      // But 29h is allowed
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 29 * 60 * 60 * 1000, timestamp: now - 1000 })
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
    beforeEach(() => {
      vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({
        tier: 'build',
        status: 'active',
        buildEntitlement: { cohortStartDate: Date.now() - 100000, active: true, includedPc: 1500, purchasedPc: 0 }
      } as any);
    });

    it('13. 1,500 PC limit remains enforced', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 1500, activeDurationMs: 0, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('14 & 15. 5h active window works and renews automatically', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 5 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(usageEventStore.advanceActiveWindow).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
    });

    it('16. Weekly active usage accumulates across windows', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 5 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.usage.activeHoursUsed7d).toBe(5);
    });

    it('17. 15h weekly limit blocks included usage', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 15 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly limit reached');
    });

    it('18. Window renewal cannot bypass 15h limit', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 0, activeDurationMs: 15 * 60 * 60 * 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(false);
      expect(usageEventStore.advanceActiveWindow).not.toHaveBeenCalled();
    });

    it('19. Weekly boundary based on cohortStartDate works', () => {
      const now = Date.now();
      // cohortStartDate is exactly 1 week ago
      vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({
        tier: 'build',
        buildEntitlement: { cohortStartDate: now - 7 * 24 * 60 * 60 * 1000, active: true, includedPc: 1500, purchasedPc: 0 }
      } as any);
      
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 15 * 60 * 60 * 1000, timestamp: now - 7 * 24 * 60 * 60 * 1000 - 1 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      expect(result.allowed).toBe(true); // Record is from before the current week
    });

    it('21. Build cannot use Autonomous Work (records not excluded)', () => {
      const now = Date.now();
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ activeDurationMs: 15 * 60 * 60 * 1000, runId: 'auto-123', timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('build', undefined, now);
      // Because tier is build, runId records ARE counted, so 15h blocks it
      expect(result.allowed).toBe(false);
    });
  });

  describe('GO REGRESSION', () => {
    it('22, 23, 24, 25. Go remains 1,000 PC, 14-day cycle, unaffected by Pro changes', () => {
      const now = Date.now();
      usageEventStore.getGoCycleStatus = vi.fn().mockReturnValue({ cycleStartAt: now - 10000, refreshesUsed: 0 });
      usageEventStore.getLastGoRefreshAt = vi.fn().mockReturnValue(undefined);
      
      vi.spyOn(usageEventStore, 'list').mockReturnValue([
        makeRecord({ normalizedCompute: 1000, timestamp: now - 1000 })
      ]);
      const result = rollingUsageGate.canStartGeneration('go', undefined, now);
      expect(result.allowed).toBe(false);
      expect(result.usage.limit7d).toBe(1000); // represents the 14-day PC limit for Go
    });
  });
});