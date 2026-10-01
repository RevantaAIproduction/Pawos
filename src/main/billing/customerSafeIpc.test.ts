import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { recordedTurnUsageResponse, toLocalUsageEventSummary, usageEventAck } from './customerSafeIpc';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const PRIVATE = ['model', 'provider', 'token', 'normalizedcompute', 'cost', 'allowance', 'micro', 'price', 'reserv'];
const leaks = (value: unknown) => PRIVATE.filter((w) => JSON.stringify(value).toLowerCase().includes(w));

const record: NormalizedUsageRecord = {
  usageEventId: 'evt-1', requestId: 'req-1', sessionId: 's-1', runId: null, provider: 'gemini', model: 'gemini-3.1-pro-preview',
  requestType: 'conversationTurn', inputTokens: 40_000, outputTokens: 800, cachedInputTokens: 0, totalTokens: 40_800, thoughtsTokens: 300,
  normalizedCompute: 92.4, activeDurationMs: 1200, timestamp: 1,
};

describe('customer-safe billing IPC responses', () => {
  it('billing:recordTurnUsage returns the local balance only — no records, model, tokens or normalizedCompute', () => {
    const response = recordedTurnUsageResponse({ limit: null, usedThisPeriod: 3, periodResetsAt: 1, usedThisWeek: 3, weekResetsAt: 1, fableUsedThisPeriod: 0, standardPurchasedUsedThisPeriod: 0 });
    expect(Object.keys(response)).toEqual(['balance']);
    expect(leaks(response)).toEqual([]);
  });

  it('billing:reportUsageEvent returns an acknowledgement only', () => {
    expect(usageEventAck()).toEqual({ ok: true });
  });

  it('billing:getUsageEvents strips model, provider, token counts and normalizedCompute', () => {
    const summary = toLocalUsageEventSummary(record);
    expect(summary).toEqual({ usageEventId: 'evt-1', timestamp: 1, requestType: 'conversationTurn', sessionId: 's-1' });
    expect(leaks(summary)).toEqual([]);
  });

  it('the IPC handlers use these shapes (no raw record or aggregate is returned)', () => {
    const ipc = fs.readFileSync(path.join(__dirname, '../ipc/ipc.ts'), 'utf-8');
    expect(ipc).toContain('return recordedTurnUsageResponse(');
    expect(ipc).toContain('return usageEventAck();');
    expect(ipc).toContain('usageEventStore.list(limit).map(toLocalUsageEventSummary)');
    expect(ipc).not.toMatch(/return \{ aggregated/);
  });
});

describe('no client-side PC estimate', () => {
  it('ConversationRuntime emits progress only — no token-based PC formula', () => {
    const runtime = fs.readFileSync(path.join(__dirname, '../../renderer/conversation/ConversationRuntime.ts'), 'utf-8');
    expect(runtime).not.toMatch(/estimatePawCompute/);
    expect(runtime).not.toMatch(/\* 0\.0001|\* 0\.0003/);
    expect(runtime).toContain('onStreamingUsage?: (elapsedSeconds: number) => void;');
  });
});
