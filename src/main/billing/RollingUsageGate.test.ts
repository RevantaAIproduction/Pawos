import { afterEach, describe, expect, it, vi } from 'vitest';
import { rollingUsageGate, WINDOW_5H_MS, WINDOW_7D_MS } from './RollingUsageGate';
import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

function makeRecord(overrides: Partial<NormalizedUsageRecord> & { normalizedCompute: number; timestamp: number }): NormalizedUsageRecord {
  return {
    usageEventId: `evt-${Math.random()}`,
    requestId: `req-${Math.random()}`,
    sessionId: null,
    runId: null,
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    requestType: 'conversationTurn',
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    totalTokens: null,
    thoughtsTokens: null,
    ...overrides,
  };
}

describe('RollingUsageGate — sumInWindow / getRollingUsage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns zero usage when the store is empty', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const summary = rollingUsageGate.getRollingUsage('pro');
    expect(summary.usage5h).toBe(0);
    expect(summary.usage7d).toBe(0);
  });

  it('sums only records inside the 5h window', () => {
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 10, timestamp: now - 1_000 }),                  // inside 5h
      makeRecord({ normalizedCompute: 20, timestamp: now - WINDOW_5H_MS + 1_000 }),  // inside 5h
      makeRecord({ normalizedCompute: 99, timestamp: now - WINDOW_5H_MS - 1_000 }),  // outside 5h but inside 7d
    ]);
    const summary = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(summary.usage5h).toBe(30);
    expect(summary.usage7d).toBe(129);
  });

  it('excludes records outside the 7d window entirely', () => {
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 5, timestamp: now - WINDOW_7D_MS - 1_000 }),  // outside 7d
    ]);
    const summary = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(summary.usage5h).toBe(0);
    expect(summary.usage7d).toBe(0);
  });

  it('excludes Fable records (fable: true) from both windows', () => {
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 50, timestamp: now - 500, fable: true }),
      makeRecord({ normalizedCompute: 10, timestamp: now - 500 }),
    ]);
    const summary = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(summary.usage5h).toBe(10);
    expect(summary.usage7d).toBe(10);
  });

  it('rounds normalizedCompute sums to 4 decimal places', () => {
    const now = Date.now();
    // 3 × 0.33337 = 1.00011 → Math.round(10001.1) / 10_000 = 1.0001 (not 1.00011)
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 0.33337, timestamp: now - 1_000 }),
      makeRecord({ normalizedCompute: 0.33337, timestamp: now - 2_000 }),
      makeRecord({ normalizedCompute: 0.33337, timestamp: now - 3_000 }),
    ]);
    const summary = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(summary.usage5h).toBe(1.0001);
  });

  it('returns the correct limits from PawComputeCapacityStore for each tier', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const goSummary = rollingUsageGate.getRollingUsage('go');
    expect(goSummary.limit5h).toBe(132);
    expect(goSummary.limit7d).toBe(528);

    const proSummary = rollingUsageGate.getRollingUsage('pro');
    expect(proSummary.limit5h).toBe(400);
    expect(proSummary.limit7d).toBe(1_600);

    const proMaxSummary = rollingUsageGate.getRollingUsage('proMax');
    expect(proMaxSummary.limit5h).toBe(2_000);
    expect(proMaxSummary.limit7d).toBe(8_000);
  });

  it('resolves Team Premium limits via seatTier parameter', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const standardSummary = rollingUsageGate.getRollingUsage('team', 'standard');
    const premiumSummary = rollingUsageGate.getRollingUsage('team', 'premium');
    expect(premiumSummary.limit5h as number).toBeGreaterThan(standardSummary.limit5h as number);
    expect(premiumSummary.limit5h).toBe(2_000);
    expect(standardSummary.limit5h).toBe(800);
  });
});

describe('RollingUsageGate — canStartGeneration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows generation when store is empty (no usage)', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const result = rollingUsageGate.canStartGeneration('pro');
    expect(result.allowed).toBe(true);
    expect(result.pooled).toBe(false);
  });

  it('blocks when 5h usage equals the limit', () => {
    const capacity = pawComputeCapacityStore.resolve('pro');
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.window5hPc as number, timestamp: now - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/5-hour/);
  });

  it('blocks when 5h usage exceeds the limit', () => {
    const capacity = pawComputeCapacityStore.resolve('pro');
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: (capacity.window5hPc as number) + 10, timestamp: now - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(false);
  });

  it('blocks when 7d usage equals the limit even though 5h is under limit', () => {
    const capacity = pawComputeCapacityStore.resolve('go');
    const now = Date.now();
    // Spread usage across 7d but keep each 5h slice under the 5h cap
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.windowWeeklyPc as number, timestamp: now - WINDOW_5H_MS - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/7 day/i);
  });

  it('allows generation when 5h usage is just under the limit', () => {
    const capacity = pawComputeCapacityStore.resolve('pro');
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: (capacity.window5hPc as number) - 0.0001, timestamp: now - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
  });

  it('old records rolling out of the 5h window restore allowed=true without any reset operation', () => {
    const capacity = pawComputeCapacityStore.resolve('go');
    const now = Date.now();
    // Record is at exactly the window boundary — excluded from 5h window (timestamp < cutoff is excluded)
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.window5hPc as number, timestamp: now - WINDOW_5H_MS - 1 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('go', undefined, now);
    // Still inside 7d window — blocks on weekly if 7d limit is smaller
    // For Go: 5h=132, 7d=528; record is 132 which is < 528, so 7d doesn't block
    expect(result.allowed).toBe(true);
  });

  it('Enterprise is pooled — returns allowed=true locally with pooled=true', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 99_999, timestamp: Date.now() - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('enterprise');
    expect(result.allowed).toBe(true);
    expect(result.pooled).toBe(true);
    if (result.pooled) expect(result.deferTo).toBe('organizationUsageService');
  });

  it('Fable records are excluded — a Fable-saturated window still allows normal generations', () => {
    const capacity = pawComputeCapacityStore.resolve('pro');
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: (capacity.window5hPc as number) * 10, timestamp: now - 1_000, fable: true }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
  });

  it('includes usage in the returned result', () => {
    const now = Date.now();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: 12.5, timestamp: now - 1_000 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.usage.usage5h).toBe(12.5);
    expect(result.usage.usage7d).toBe(12.5);
  });

  it('Team Standard and Team Premium produce different block thresholds', () => {
    const standardCapacity = pawComputeCapacityStore.resolve('team', 'standard');
    const now = Date.now();
    // Usage that exhausts Standard 5h limit but not Premium
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: standardCapacity.window5hPc as number, timestamp: now - 1_000 }),
    ]);
    const standardResult = rollingUsageGate.canStartGeneration('team', 'standard', now);
    const premiumResult = rollingUsageGate.canStartGeneration('team', 'premium', now);
    expect(standardResult.allowed).toBe(false);
    expect(premiumResult.allowed).toBe(true);
  });

  it('weekly expired usage restores allowed=true without any reset operation', () => {
    const capacity = pawComputeCapacityStore.resolve('pro');
    const now = Date.now();
    // Record outside both windows — should count for neither
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.windowWeeklyPc as number, timestamp: now - WINDOW_7D_MS - 1 }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
  });

  it('simultaneous requests: second call is blocked when an in-flight slot is already reserved', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    // First call: allowed, then reserve a slot (mimicking the IPC handler)
    const resultA = rollingUsageGate.canStartGeneration('pro');
    expect(resultA.allowed).toBe(true);
    rollingUsageGate.reserveSlot();

    // Second call while slot is in-flight: must be blocked
    const resultB = rollingUsageGate.canStartGeneration('pro');
    expect(resultB.allowed).toBe(false);
    if (!resultB.allowed) expect(resultB.reason).toMatch(/in progress/i);

    // After releasing the slot, generation is allowed again
    rollingUsageGate.releaseSlot();
    const resultC = rollingUsageGate.canStartGeneration('pro');
    expect(resultC.allowed).toBe(true);
  });

  it('blocked request via in-flight slot: the gate returns allowed=false without touching the store', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    rollingUsageGate.reserveSlot();
    const result = rollingUsageGate.canStartGeneration('go');
    // Gate blocked — no write to UsageEventStore would follow (the caller aborts)
    expect(result.allowed).toBe(false);
    rollingUsageGate.releaseSlot();
  });
});

describe('RollingUsageGate — background task exclusion', () => {
  afterEach(() => vi.restoreAllMocks());

  it('backgroundTask records do NOT count against the rolling window', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('pro');
    // Flood the window with background-task events exceeding the 5h limit
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: (capacity.window5hPc as number) * 2, timestamp: now - 1_000, requestType: 'backgroundTask' }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
    expect(result.usage.usage5h).toBe(0);
  });

  it('conversationTurn records count against the rolling window', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('go');
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.window5hPc as number, timestamp: now - 1_000, requestType: 'conversationTurn' }),
    ]);
    const result = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(result.allowed).toBe(false);
  });

  it('toolContinuation records count against the rolling window (part of the same conversation turn cost)', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('go');
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: capacity.window5hPc as number, timestamp: now - 1_000, requestType: 'toolContinuation' }),
    ]);
    const result = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(result.allowed).toBe(false);
  });

  it('mixed background + conversation usage: only conversation usage counts toward the limit', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('pro');
    const halfLimit = (capacity.window5hPc as number) / 2;
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: halfLimit, timestamp: now - 1_000, requestType: 'conversationTurn' }),
      // Background usage on top — must not push us over the limit
      makeRecord({ normalizedCompute: capacity.window5hPc as number, timestamp: now - 500, requestType: 'backgroundTask' }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
    expect(result.usage.usage5h).toBe(halfLimit);
  });

  it('Fable records remain excluded regardless of requestType', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('pro');
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      makeRecord({ normalizedCompute: (capacity.window5hPc as number) * 2, timestamp: now - 1_000, fable: true, requestType: 'conversationTurn' }),
    ]);
    const result = rollingUsageGate.canStartGeneration('pro', undefined, now);
    expect(result.allowed).toBe(true);
  });
});
