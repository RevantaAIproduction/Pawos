import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-usage-metering-test-'));
  return { app: { getPath: () => tmp } };
});

import { pawComputeConfigStore } from './PawComputeConfigStore';
import { usageEventStore } from './UsageEventStore';
import { computeNormalizedCompute, recordUsageEvent, recordTurnUsage } from './UsageMeteringEngine';
import type { ProviderUsageMetadata } from '../../shared/billing/UsageMeteringTypes';

beforeAll(() => {
  pawComputeConfigStore.init();
  usageEventStore.init();
});

function usage(overrides: Partial<ProviderUsageMetadata> = {}): ProviderUsageMetadata {
  return {
    provider: 'gemini',
    model: 'gemini-flash-latest',
    inputTokens: 1000,
    outputTokens: 500,
    cachedInputTokens: 0,
    totalTokens: 1500,
    thoughtsTokens: 0,
    requestId: null,
    ...overrides,
  };
}

/**
 * Real Gemini `usageMetadata` captured from live calls on the actual PawOS conversation path
 * (real system prompt + real 190-tool payload), 2026-08-18. Used verbatim so the cache-accounting
 * assertions below are anchored to genuine provider output, never hand-invented numbers.
 */
const REAL_COLD = { promptTokenCount: 39201, candidatesTokenCount: 698, thoughtsTokenCount: 87, totalTokenCount: 39986 };
const REAL_WARM = { promptTokenCount: 39212, candidatesTokenCount: 649, cachedContentTokenCount: 36129, thoughtsTokenCount: 248, totalTokenCount: 40109 };

/** Mirrors exactly how every real call site maps a Gemini usageMetadata payload onto ProviderUsageMetadata. */
function fromGemini(meta: Record<string, number>, model = 'gemini-flash-latest'): ProviderUsageMetadata {
  return {
    provider: 'gemini',
    model,
    inputTokens: meta.promptTokenCount ?? null,
    outputTokens: meta.candidatesTokenCount ?? null,
    cachedInputTokens: meta.cachedContentTokenCount ?? null,
    totalTokens: meta.totalTokenCount ?? null,
    thoughtsTokens: meta.thoughtsTokenCount ?? null,
    requestId: null,
  };
}

describe('PawComputeConfigStore — real, sourced Gemini pricing, never invented', () => {
  it('resolves gemini-flash-latest / gemini-flash-lite-latest / gemini-pro-latest to genuinely different, real rates', () => {
    const flash = pawComputeConfigStore.resolvePricing('gemini-flash-latest');
    const flashLite = pawComputeConfigStore.resolvePricing('gemini-flash-lite-latest');
    const pro = pawComputeConfigStore.resolvePricing('gemini-pro-latest');
    // Pro must cost strictly more than Flash, which must cost strictly more than Flash-Lite —
    // a real, sourced pricing tier ladder, not three identical placeholder numbers.
    expect(pro.inputPerMillionUsd).toBeGreaterThan(flash.inputPerMillionUsd);
    expect(flash.inputPerMillionUsd).toBeGreaterThan(flashLite.inputPerMillionUsd);
    expect(pro.outputPerMillionUsd).toBeGreaterThan(flash.outputPerMillionUsd);
    expect(flash.outputPerMillionUsd).toBeGreaterThan(flashLite.outputPerMillionUsd);
  });

  it('cached input pricing is always cheaper than fresh input pricing for every real model', () => {
    for (const model of ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest']) {
      const pricing = pawComputeConfigStore.resolvePricing(model);
      expect(pricing.cachedInputPerMillionUsd).toBeLessThan(pricing.inputPerMillionUsd);
    }
  });

  it('falls back to a real, non-zero default rate for an unlisted Gemini model id, never $0', () => {
    const pricing = pawComputeConfigStore.resolvePricing('gemini-some-future-model-id');
    expect(pricing.inputPerMillionUsd).toBeGreaterThan(0);
    expect(pricing.outputPerMillionUsd).toBeGreaterThan(0);
  });
});

describe('computeNormalizedCompute — deterministic Gemini-usage-driven formula, never a flat unit', () => {
  it('SCENARIO 1: a tiny request produces a small, non-zero Paw Compute amount', () => {
    const tiny = computeNormalizedCompute(usage({ inputTokens: 50, outputTokens: 20, totalTokens: 70 }));
    expect(tiny).toBeGreaterThan(0);
  });

  it('SCENARIO 2: a large request produces a proportionally larger amount than a tiny one for the same model', () => {
    const tiny = computeNormalizedCompute(usage({ inputTokens: 50, outputTokens: 20 }));
    const large = computeNormalizedCompute(usage({ inputTokens: 50_000, outputTokens: 20_000 }));
    expect(large).toBeGreaterThan(tiny * 100);
  });

  it('is a pure function of real token counts and model — identical input always produces identical output', () => {
    const a = computeNormalizedCompute(usage({ inputTokens: 12345, outputTokens: 6789 }));
    const b = computeNormalizedCompute(usage({ inputTokens: 12345, outputTokens: 6789 }));
    expect(a).toBe(b);
  });

  it('matches the real, disclosed formula exactly: realUsdCost = tokens * (pricePerMillion / 1e6); Paw Compute = realUsdCost * pawComputePerUsd', () => {
    const pricing = pawComputeConfigStore.resolvePricing('gemini-flash-latest');
    const perUsd = pawComputeConfigStore.getPawComputePerUsd();
    const inputTokens = 18_421;
    const outputTokens = 4_832;
    const expectedUsd =
      inputTokens * (pricing.inputPerMillionUsd / 1_000_000) + outputTokens * (pricing.outputPerMillionUsd / 1_000_000);
    const expectedCompute = Math.round(expectedUsd * perUsd * 10_000) / 10_000;
    const actual = computeNormalizedCompute(usage({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }));
    expect(actual).toBe(expectedCompute);
  });

  it('SCENARIO 4: cached tokens are priced at the real, cheaper cached rate, distinct from fresh input tokens', () => {
    // cachedContentTokenCount is a SUBSET of promptTokenCount (verified against real Gemini payloads
    // — see ProviderUsageMetadata's doc comment), so holding the prompt size fixed and increasing the
    // cached portion moves tokens from the fresh rate onto the cheaper cached rate. It must therefore
    // REDUCE the charge — never increase it, which is what the pre-correction formula did by charging
    // the same tokens at both rates.
    const noCache = computeNormalizedCompute(usage({ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 0, thoughtsTokens: 0 }));
    const halfCached = computeNormalizedCompute(usage({ inputTokens: 10_000, cachedInputTokens: 5_000, outputTokens: 0, thoughtsTokens: 0 }));
    const fullyCached = computeNormalizedCompute(usage({ inputTokens: 10_000, cachedInputTokens: 10_000, outputTokens: 0, thoughtsTokens: 0 }));

    expect(halfCached).toBeLessThan(noCache);
    expect(fullyCached).toBeLessThan(halfCached);
    // Cached tokens are still real, billed compute — cheaper, never free.
    expect(fullyCached).toBeGreaterThan(0);

    // And the two rates are genuinely distinct: a fully-cached prompt costs exactly the cached-rate
    // ratio of the same prompt billed entirely as fresh input.
    const pricing = pawComputeConfigStore.resolvePricing('gemini-flash-latest');
    expect(fullyCached / noCache).toBeCloseTo(pricing.cachedInputPerMillionUsd / pricing.inputPerMillionUsd, 6);
  });

  it('a request with zero tokens on every field produces exactly zero Paw Compute, never a fabricated minimum', () => {
    const zero = computeNormalizedCompute(usage({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 }));
    expect(zero).toBe(0);
  });

  it('null token fields (a provider that reported nothing) are treated as zero, never guessed', () => {
    const nullish = computeNormalizedCompute(usage({ inputTokens: null, outputTokens: null, cachedInputTokens: null, totalTokens: null }));
    expect(nullish).toBe(0);
  });
});

describe('recordUsageEvent — one real Gemini request = exactly one durable, uniquely-identified event', () => {
  it('SCENARIO 9 (idempotency): two separate real requests each mint their own distinct usageEventId, never reused', () => {
    const first = recordUsageEvent(usage(), 'conversationTurn', { sessionId: 's1', runId: null });
    const second = recordUsageEvent(usage(), 'conversationTurn', { sessionId: 's1', runId: null });
    expect(first.usageEventId).not.toBe(second.usageEventId);
  });

  it('SCENARIO 7: a direct Gemini call site (backgroundTask) is metered identically to a conversation turn', () => {
    const record = recordUsageEvent(usage({ inputTokens: 300, outputTokens: 100 }), 'backgroundTask', { sessionId: null, runId: null });
    expect(record.requestType).toBe('backgroundTask');
    expect(record.normalizedCompute).toBeGreaterThan(0);
    expect(record.provider).toBe('gemini');
  });

  it('persists the record with the real token counts actually passed in — never fabricated example values', () => {
    const record = recordUsageEvent(usage({ inputTokens: 18_421, outputTokens: 4_832, cachedInputTokens: 0, totalTokens: 23_253 }), 'conversationTurn', {
      sessionId: null,
      runId: null,
    });
    expect(record.inputTokens).toBe(18_421);
    expect(record.outputTokens).toBe(4_832);
    expect(record.totalTokens).toBe(23_253);
  });
});

describe('Gemini cache accounting — cached prompt tokens are billed once, at the cached rate', () => {
  const flash = { input: 0.75, output: 3.75, cached: 0.075 };
  const per = (n: number, rate: number) => n * (rate / 1_000_000);

  it('REAL cold request (no cache): bills the whole prompt as fresh input, plus output + thoughts', () => {
    const pc = computeNormalizedCompute(fromGemini(REAL_COLD));
    const expectedUsd = per(39_201, flash.input) + per(698 + 87, flash.output);
    expect(pc).toBeCloseTo(expectedUsd * 1000, 3);
  });

  it('REAL warm request: cached tokens are SUBTRACTED from fresh input, never charged at both rates', () => {
    const pc = computeNormalizedCompute(fromGemini(REAL_WARM));
    const fresh = 39_212 - 36_129; // 3,083 genuinely-new prompt tokens
    const expectedUsd = per(fresh, flash.input) + per(36_129, flash.cached) + per(649 + 248, flash.output);
    expect(pc).toBeCloseTo(expectedUsd * 1000, 3);
  });

  it('REGRESSION: a cache HIT must cost strictly LESS than an otherwise-comparable cache MISS', () => {
    // The exact defect this fix corrects: under the old formula the warm request billed 34.55 PC
    // against the cold request's 32.02 PC — a cache hit cost MORE, which is backwards.
    const cold = computeNormalizedCompute(fromGemini(REAL_COLD));
    const warm = computeNormalizedCompute(fromGemini(REAL_WARM));
    expect(warm).toBeLessThan(cold);
    // And by a real margin, not a rounding artifact — the cached rate is 10x cheaper than fresh input.
    expect(warm).toBeLessThan(cold / 2);
  });

  it('a fully-cached prompt bills every prompt token at the cached rate and none at the fresh rate', () => {
    const pc = computeNormalizedCompute(usage({ inputTokens: 10_000, cachedInputTokens: 10_000, outputTokens: 0, thoughtsTokens: 0 }));
    expect(pc).toBeCloseTo(per(10_000, flash.cached) * 1000, 6);
  });

  it('thoughts tokens are billed at the OUTPUT rate, and exactly once', () => {
    const withoutThoughts = computeNormalizedCompute(usage({ inputTokens: 1000, outputTokens: 500, thoughtsTokens: 0 }));
    const withThoughts = computeNormalizedCompute(usage({ inputTokens: 1000, outputTokens: 500, thoughtsTokens: 200 }));
    expect(withThoughts - withoutThoughts).toBeCloseTo(per(200, flash.output) * 1000, 6);
    // Equivalent to having reported those tokens as plain output — proving a single, output-rate charge.
    const asPlainOutput = computeNormalizedCompute(usage({ inputTokens: 1000, outputTokens: 700, thoughtsTokens: 0 }));
    expect(withThoughts).toBeCloseTo(asPlainOutput, 6);
  });

  it('absent/null cached and thoughts fields behave exactly like zero — never NaN, never a skipped charge', () => {
    const nulls = computeNormalizedCompute(usage({ inputTokens: 2000, outputTokens: 300, cachedInputTokens: null, thoughtsTokens: null }));
    const zeros = computeNormalizedCompute(usage({ inputTokens: 2000, outputTokens: 300, cachedInputTokens: 0, thoughtsTokens: 0 }));
    expect(nulls).toBe(zeros);
    expect(Number.isFinite(nulls)).toBe(true);
    expect(nulls).toBeGreaterThan(0);
  });

  it('a malformed payload claiming more cached than prompt tokens can never produce a negative charge', () => {
    const pc = computeNormalizedCompute(usage({ inputTokens: 1000, cachedInputTokens: 999_999, outputTokens: 0, thoughtsTokens: 0 }));
    expect(pc).toBeGreaterThan(0);
    // Fresh input clamps to 0; only the (claimed) cached tokens are billed, at the cached rate.
    expect(pc).toBeCloseTo(per(999_999, flash.cached) * 1000, 3);
  });

  it('token identity holds on the real payloads: prompt + candidates + thoughts === totalTokenCount', () => {
    expect(REAL_COLD.promptTokenCount + REAL_COLD.candidatesTokenCount + REAL_COLD.thoughtsTokenCount).toBe(REAL_COLD.totalTokenCount);
    expect(REAL_WARM.promptTokenCount + REAL_WARM.candidatesTokenCount + REAL_WARM.thoughtsTokenCount).toBe(REAL_WARM.totalTokenCount);
    // And cached is a SUBSET of prompt, not an addend — otherwise the identity above could not hold.
    expect(REAL_WARM.cachedContentTokenCount).toBeLessThan(REAL_WARM.promptTokenCount);
  });

  it('persists the real cached/thoughts breakdown on the ledger record, not just the final charge', () => {
    const record = recordUsageEvent(fromGemini(REAL_WARM), 'conversationTurn', { sessionId: 'cache-ledger', runId: null });
    expect(record.cachedInputTokens).toBe(36_129);
    expect(record.thoughtsTokens).toBe(248);
    expect(record.inputTokens).toBe(39_212); // raw prompt count, never pre-subtracted on the ledger
  });
});

describe('requestId idempotency — the same real Gemini request can never be charged twice', () => {
  it('recording the SAME requestId twice produces exactly ONE usage event, and returns the original unchanged', () => {
    const before = usageEventStore.list().length;
    const shared = usage({ requestId: 'req-idempotency-a', inputTokens: 4_210, outputTokens: 990 });
    const first = recordUsageEvent(shared, 'conversationTurn', { sessionId: 'idem', runId: null });
    const second = recordUsageEvent(shared, 'conversationTurn', { sessionId: 'idem', runId: null });

    // Same record object returned — not a second, separately-identified event.
    expect(second.usageEventId).toBe(first.usageEventId);
    expect(second.timestamp).toBe(first.timestamp);
    expect(second.normalizedCompute).toBe(first.normalizedCompute);
    // And nothing extra was appended to the durable ledger.
    expect(usageEventStore.list().length).toBe(before + 1);
    expect(usageEventStore.list().filter((r) => r.requestId === 'req-idempotency-a')).toHaveLength(1);
  });

  it('DIFFERENT requestIds are always separate events, even with byte-identical token counts', () => {
    const before = usageEventStore.list().length;
    const a = recordUsageEvent(usage({ requestId: 'req-distinct-a' }), 'backgroundTask', { sessionId: null, runId: null });
    const b = recordUsageEvent(usage({ requestId: 'req-distinct-b' }), 'backgroundTask', { sessionId: null, runId: null });

    expect(a.usageEventId).not.toBe(b.usageEventId);
    expect(a.requestId).toBe('req-distinct-a');
    expect(b.requestId).toBe('req-distinct-b');
    expect(usageEventStore.list().length).toBe(before + 2);
  });

  it('a null requestId (a call site not yet wired) always appends — never silently deduplicated against another null', () => {
    const before = usageEventStore.list().length;
    const first = recordUsageEvent(usage({ requestId: null }), 'backgroundTask', { sessionId: null, runId: null });
    const second = recordUsageEvent(usage({ requestId: null }), 'backgroundTask', { sessionId: null, runId: null });

    expect(first.usageEventId).not.toBe(second.usageEventId);
    expect(usageEventStore.list().length).toBe(before + 2);
  });

  it('ONE turn containing 5 distinct real Gemini requests produces exactly 5 events — a turn is never deduplicated as a whole', () => {
    const before = usageEventStore.list().length;
    const requests = [
      { usage: usage({ requestId: 'turn5-r1', inputTokens: 1_200, outputTokens: 300 }), requestType: 'conversationTurn' as const },
      { usage: usage({ requestId: 'turn5-r2', inputTokens: 1_400, outputTokens: 260 }), requestType: 'toolContinuation' as const },
      { usage: usage({ requestId: 'turn5-r3', inputTokens: 1_800, outputTokens: 410 }), requestType: 'toolContinuation' as const },
      { usage: usage({ requestId: 'turn5-r4', inputTokens: 2_100, outputTokens: 520 }), requestType: 'toolContinuation' as const },
      { usage: usage({ requestId: 'turn5-r5', inputTokens: 2_600, outputTokens: 700 }), requestType: 'toolContinuation' as const },
    ];
    const aggregated = recordTurnUsage(requests, { sessionId: 'turn-of-5', runId: null });

    expect(aggregated.requestCount).toBe(5);
    expect(aggregated.records).toHaveLength(5);
    expect(new Set(aggregated.records.map((r) => r.requestId)).size).toBe(5);
    expect(usageEventStore.list().length).toBe(before + 5);
  });

  it('replaying an ENTIRE already-recorded turn charges nothing further — every request dedupes on its own requestId', () => {
    const requests = [
      { usage: usage({ requestId: 'replay-r1', inputTokens: 900, outputTokens: 200 }), requestType: 'conversationTurn' as const },
      { usage: usage({ requestId: 'replay-r2', inputTokens: 1_100, outputTokens: 350 }), requestType: 'toolContinuation' as const },
    ];
    const first = recordTurnUsage(requests, { sessionId: 'replay', runId: null });
    const countAfterFirst = usageEventStore.list().length;

    const replayed = recordTurnUsage(requests, { sessionId: 'replay', runId: null });

    // No new rows appended, and the replay resolves to exactly the same events as the first run.
    expect(usageEventStore.list().length).toBe(countAfterFirst);
    expect(replayed.records.map((r) => r.usageEventId)).toEqual(first.records.map((r) => r.usageEventId));
    expect(replayed.totalNormalizedCompute).toBeCloseTo(first.totalNormalizedCompute, 6);
  });
});

describe('recordTurnUsage — aggregates ALL real Gemini requests belonging to one visible turn', () => {
  it('SCENARIO 3 + 13: a turn with 3 tool-continuation requests produces exactly 3 usage records, summed correctly', () => {
    const requests = [
      { usage: usage({ inputTokens: 1000, outputTokens: 200 }), requestType: 'conversationTurn' as const },
      { usage: usage({ inputTokens: 500, outputTokens: 150 }), requestType: 'toolContinuation' as const },
      { usage: usage({ inputTokens: 800, outputTokens: 300 }), requestType: 'toolContinuation' as const },
    ];
    const aggregated = recordTurnUsage(requests, { sessionId: 'turn-1', runId: null });
    expect(aggregated.requestCount).toBe(3);
    expect(aggregated.records).toHaveLength(3);
    const expectedTotal = aggregated.records.reduce((sum, r) => sum + r.normalizedCompute, 0);
    expect(aggregated.totalNormalizedCompute).toBeCloseTo(expectedTotal, 6);
    // The 3-request turn must cost strictly more than any single one of its own requests alone —
    // proving real aggregation, not "1 turn = 1 flat charge" collapsed back down.
    expect(aggregated.totalNormalizedCompute).toBeGreaterThan(aggregated.records[0]!.normalizedCompute);
  });

  it('SCENARIO 5: a turn with zero real Gemini requests produces zero usage and zero Paw Compute, never a fabricated minimum', () => {
    const aggregated = recordTurnUsage([], { sessionId: 'turn-empty', runId: null });
    expect(aggregated.requestCount).toBe(0);
    expect(aggregated.records).toHaveLength(0);
    expect(aggregated.totalNormalizedCompute).toBe(0);
  });

  it('SCENARIO 6: local tool execution alone (no Gemini call in the array) contributes nothing — never a fake per-tool charge', () => {
    // A turn where the model's own reasoning call succeeded but every subsequent step was pure local
    // tool execution (no further Gemini request) is represented as a single-request array — the tool
    // execution itself never appears as a separate, fabricated usage entry.
    const aggregated = recordTurnUsage([{ usage: usage({ inputTokens: 200, outputTokens: 50 }), requestType: 'conversationTurn' }], {
      sessionId: 'turn-2',
      runId: null,
    });
    expect(aggregated.requestCount).toBe(1);
  });

  it('SCENARIO 12: two separate user turns produce two separate, independently-summed aggregates', () => {
    const turnA = recordTurnUsage([{ usage: usage({ inputTokens: 1000, outputTokens: 400 }), requestType: 'conversationTurn' }], {
      sessionId: 'turn-A',
      runId: null,
    });
    const turnB = recordTurnUsage([{ usage: usage({ inputTokens: 5000, outputTokens: 2000 }), requestType: 'conversationTurn' }], {
      sessionId: 'turn-B',
      runId: null,
    });
    expect(turnA.totalNormalizedCompute).not.toBe(turnB.totalNormalizedCompute);
    expect(turnB.totalNormalizedCompute).toBeGreaterThan(turnA.totalNormalizedCompute);
  });

  it('every record in an aggregated turn gets its own unique usageEventId — never one shared id for the whole turn', () => {
    const aggregated = recordTurnUsage(
      [
        { usage: usage({ inputTokens: 100 }), requestType: 'conversationTurn' },
        { usage: usage({ inputTokens: 200 }), requestType: 'toolContinuation' },
      ],
      { sessionId: 'turn-ids', runId: null }
    );
    const ids = new Set(aggregated.records.map((r) => r.usageEventId));
    expect(ids.size).toBe(2);
  });
});

describe('SCENARIO 15: usage events persist across a simulated app restart', () => {
  it('a durably-appended record survives re-initializing the store from disk', () => {
    const record = recordUsageEvent(usage({ inputTokens: 777, outputTokens: 111 }), 'conversationTurn', { sessionId: 'restart-test', runId: null });
    // Simulate an app restart by re-initializing the store from the same on-disk file.
    usageEventStore.init();
    const reloaded = usageEventStore.list().find((r) => r.usageEventId === record.usageEventId);
    expect(reloaded).toBeDefined();
    expect(reloaded?.inputTokens).toBe(777);
    expect(reloaded?.outputTokens).toBe(111);
  });

  it('SCENARIO 14: reading the event list twice in a row (a UI refresh) never increases stored usage', () => {
    const before = usageEventStore.list().length;
    usageEventStore.list();
    usageEventStore.list();
    const after = usageEventStore.list().length;
    expect(after).toBe(before);
  });
});
