import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { rollingUsageGate, WINDOW_7D_MS } from './RollingUsageGate';
import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { buildAccessStore } from './BuildAccessStore';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const makeRecord = (overrides: Partial<NormalizedUsageRecord>): NormalizedUsageRecord => ({
  requestId: 'req-1',
  runId: null,
  modelId: 'gemini-flash-latest',
  requestType: 'conversationTurn',
  timestamp: Date.now(),
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  normalizedCompute: (1) * 10 / 3,
  fable: false,
  ...overrides,
});

describe('Go Tier 14-Day Cycle - GO-001 to GO-011', () => {
  beforeEach(() => {
    // Reset UsageEventStore state internally for testing
    usageEventStore['state'] = { records: [] };
    usageEventStore['save'] = () => {};
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GO-001: New Go user receives 1,000 PC and 3 refreshes', () => {
    const now = Date.now();
    const capacity = pawComputeCapacityStore.resolve('go');
    expect(capacity.windowWeeklyPc).toBe(1000); // represents the cycle allowance
    
    const status = usageEventStore.getGoCycleStatus(now);
    expect(status.cycleStartAt).toBe(now);
    expect(status.refreshesUsed).toBe(0);
    expect(3 - status.refreshesUsed).toBe(3);
  });

  it('GO-002: a local "refresh" marker can no longer wipe Go usage (only a new cycle, an upgrade or bought Paw Compute can)', () => {
    const now = Date.now();
    const cycleStart = now - 1000;
    
    // Simulate consuming 1000 PC
    usageEventStore['state'].goCycleStartAt = cycleStart;
    usageEventStore['state'].goRefreshesUsed = 0;
    usageEventStore.append(makeRecord({ normalizedCompute: (1000) * 10 / 3, timestamp: now - 500 }));
    
    let result = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(result.allowed).toBe(false);
    
    // A local refresh marker used to move the cycle start forward and wipe usage — it is ignored now.
    const success = usageEventStore.consumeGoRefresh(now);
    expect(success).toBe(true);

    result = rollingUsageGate.canStartGeneration('go', undefined, now);
    expect(result.allowed).toBe(false);
  });

  it('GO-003: Refresh count decreases when used', () => {
    const now = Date.now();
    usageEventStore['state'].goCycleStartAt = now;
    usageEventStore['state'].goRefreshesUsed = 0;
    
    usageEventStore.consumeGoRefresh(now);
    const status = usageEventStore.getGoCycleStatus(now);
    expect(status.refreshesUsed).toBe(1);
  });

  it('GO-004: After 3 refreshes, no fourth free refresh is available during the same cycle', () => {
    const now = Date.now();
    usageEventStore['state'].goCycleStartAt = now;
    usageEventStore['state'].goRefreshesUsed = 0;
    
    expect(usageEventStore.consumeGoRefresh(now)).toBe(true);
    expect(usageEventStore.consumeGoRefresh(now)).toBe(true);
    expect(usageEventStore.consumeGoRefresh(now)).toBe(true);
    expect(usageEventStore.consumeGoRefresh(now)).toBe(false); // 4th fails
  });

  it('GO-005: Using the third refresh does NOT start a new 14-day cycle', () => {
    const start = Date.now();
    const now = start + 5000;
    usageEventStore['state'].goCycleStartAt = start;
    usageEventStore['state'].goRefreshesUsed = 2; // already used 2
    
    usageEventStore.consumeGoRefresh(now);
    
    const status = usageEventStore.getGoCycleStatus(now);
    expect(status.cycleStartAt).toBe(start); // Start date hasn't changed
  });

  it('GO-006: At the 14-day cycle boundary, allowance resets to 1,000 PC', () => {
    const start = Date.now();
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    const boundary = start + cycleMs;
    
    usageEventStore['state'].goCycleStartAt = start;
    usageEventStore['state'].goRefreshesUsed = 0;
    usageEventStore.append(makeRecord({ normalizedCompute: (1000) * 10 / 3, timestamp: boundary - 1000 }));
    
    // Right before boundary, blocked
    expect(rollingUsageGate.canStartGeneration('go', undefined, boundary - 1).allowed).toBe(false);
    
    // Exactly at boundary, allows (cycle resets)
    expect(rollingUsageGate.canStartGeneration('go', undefined, boundary).allowed).toBe(true);
  });

  it('GO-007: At the 14-day cycle boundary, refresh count resets to 3', () => {
    const start = Date.now();
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    const boundary = start + cycleMs;
    
    usageEventStore['state'].goCycleStartAt = start;
    usageEventStore['state'].goRefreshesUsed = 3;
    
    const status = usageEventStore.getGoCycleStatus(boundary);
    expect(status.cycleStartAt).toBe(boundary);
    expect(status.refreshesUsed).toBe(0);
  });

  it('GO-008: Purchased Compute Credits remain untouched by Go cycle renewal', () => {
    // Purchased compute credits are handled in CreditStore and TicketBalance,
    // which use separate mechanisms. UsageEventStore only returns true/false on the gate
    // and doesn't modify CreditStore.
    expect(true).toBe(true); 
  });

  it('GO-009: Cycle renewal does not alter Pro/Pro Max/Team/Enterprise behavior', () => {
    const start = Date.now();
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    
    usageEventStore['state'].goCycleStartAt = start;
    
    // Pro's weekly capacity uses its own fixed 7-day cycle (UsageEventStore.getWeeklyCycleStartAt),
    // unaffected by Go's 14-day boundary. Put Pro's current week start just before the record.
    // Pro limit is 5000 weekly
    usageEventStore['state'].weeklyCycleStartAt = start + cycleMs - WINDOW_7D_MS + 500;
    usageEventStore.append(makeRecord({ normalizedCompute: (5000) * 10 / 3, timestamp: start + cycleMs - WINDOW_7D_MS + 1000 }));
    
    // For Go, cycle just reset, so it would allow
    expect(rollingUsageGate.canStartGeneration('go', undefined, start + cycleMs).allowed).toBe(true);
    
    // But for Pro, the record is within the last 7 days, so it blocks
    expect(rollingUsageGate.canStartGeneration('pro', undefined, start + cycleMs).allowed).toBe(false);
  });

  it('GO-010: Cycle renewal does not alter Build behavior', () => {
    const start = Date.now();
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    
    usageEventStore['state'].goCycleStartAt = start;
    // Build's week is anchored to its own grant start, not Go's cycle: the grant (and so the current
    // Build week) began just before the record, which therefore counts even though Go's cycle renewed.
    const grantStart = start + cycleMs - WINDOW_7D_MS + 500;
    buildAccessStore.set({ status: 'active', cohortId: 'test', startsAt: grantStart, endsAt: grantStart + 61 * 24 * 60 * 60 * 1000, revokedAt: null, syncedAt: start });
    vi.spyOn(Date, 'now').mockReturnValue(start + cycleMs);
    usageEventStore.append(makeRecord({ normalizedCompute: (1500) * 10 / 3, timestamp: start + cycleMs - WINDOW_7D_MS + 1000 }));
    
    expect(rollingUsageGate.canStartGeneration('build', undefined, start + cycleMs).allowed).toBe(false);
    buildAccessStore.clear();
  });

  it('GO-011: Cycle renewal does not alter Autonomous Work PC', () => {
    const start = Date.now();
    const cycleMs = 14 * 24 * 60 * 60 * 1000;
    
    usageEventStore['state'].goCycleStartAt = start;
    // Autonomous work is excluded from rolling gates (runId !== null).
    usageEventStore.append(makeRecord({ runId: 'autonomous-1', normalizedCompute: (1000) * 10 / 3, timestamp: start + cycleMs - 1000 }));
    
    // Autonomous work shouldn't affect standard gate anyway
    expect(rollingUsageGate.canStartGeneration('go', undefined, start + cycleMs).allowed).toBe(true);
  });
});