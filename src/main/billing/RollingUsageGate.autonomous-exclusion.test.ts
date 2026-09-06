import { describe, it, expect, afterEach, vi } from 'vitest';
import { rollingUsageGate, WINDOW_5H_MS } from './RollingUsageGate';
import { usageEventStore } from './UsageEventStore';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

/**
 * Unit test verifying the autonomous work exclusion fix (runId !== null check).
 *
 * This test proves that the one-line fix correctly excludes autonomous work
 * from rolling Tier Compute quota calculations.
 */

describe('RollingUsageGate - Autonomous Work Exclusion', () => {
  const now = Date.now();
  const within5h = now - WINDOW_5H_MS / 2;

  afterEach(() => vi.restoreAllMocks());

  it('excludes autonomous work (runId !== null) from rolling quota', () => {
    // Autonomous record: runId is set to task ID (not null)
    const autonomousRecord: NormalizedUsageRecord = {
      usageEventId: 'evt-auto-1',
      requestId: 'req-auto-1',
      sessionId: null,
      runId: 'autonomous-task-xyz', // ← Non-null runId marks autonomous work
      provider: 'gemini',
      model: 'paw-core',
      requestType: 'conversationTurn',
      inputTokens: 5000,
      outputTokens: 2000,
      cachedInputTokens: 0,
      totalTokens: 7000,
      thoughtsTokens: null,
      normalizedCompute: 500, // Large computation
      timestamp: within5h,
    };

    vi.spyOn(usageEventStore, 'list').mockReturnValue([autonomousRecord]);

    // Even though autonomous record uses 500 PC, it should NOT count toward quota
    const usage = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(usage.usage5h).toBe(0); // ← Proves autonomous work is excluded
  });

  it('includes normal work (runId === null) in rolling quota', () => {
    // Normal record: runId is explicitly null
    const normalRecord: NormalizedUsageRecord = {
      usageEventId: 'evt-normal-1',
      requestId: 'req-normal-1',
      sessionId: 'session-1',
      runId: null, // ← Null runId marks normal conversation
      provider: 'gemini',
      model: 'paw-core',
      requestType: 'conversationTurn',
      inputTokens: 1000,
      outputTokens: 500,
      cachedInputTokens: 0,
      totalTokens: 1500,
      thoughtsTokens: null,
      normalizedCompute: 100,
      timestamp: within5h,
    };

    vi.spyOn(usageEventStore, 'list').mockReturnValue([normalRecord]);

    // Normal conversation SHOULD count toward quota
    const usage = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(usage.usage5h).toBe(100); // ← Proves normal work is included
  });

  it('correctly separates autonomous and normal records', () => {
    const records: NormalizedUsageRecord[] = [
      // Normal conversation
      {
        usageEventId: 'evt-1',
        requestId: 'req-1',
        sessionId: 'session-1',
        runId: null,
        provider: 'gemini',
        model: 'paw-core',
        requestType: 'conversationTurn',
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: 0,
        totalTokens: 150,
        thoughtsTokens: null,
        normalizedCompute: 50,
        timestamp: within5h,
      },
      // Autonomous task
      {
        usageEventId: 'evt-2',
        requestId: 'req-2',
        sessionId: null,
        runId: 'autonomous-task-1',
        provider: 'gemini',
        model: 'paw-core',
        requestType: 'conversationTurn',
        inputTokens: 2000,
        outputTokens: 1000,
        cachedInputTokens: 0,
        totalTokens: 3000,
        thoughtsTokens: null,
        normalizedCompute: 300,
        timestamp: within5h,
      },
    ];

    vi.spyOn(usageEventStore, 'list').mockReturnValue(records);

    // Only the normal record (50 PC) should count; autonomous (300 PC) excluded
    const usage = rollingUsageGate.getRollingUsage('pro', undefined, now);
    expect(usage.usage5h).toBe(50); // ← Only normal work counted
  });
});
