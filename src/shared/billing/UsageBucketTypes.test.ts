import { describe, expect, it } from 'vitest';
import { toCustomerUsageHistory, toCustomerUsageSummary, usageLimitMessage } from './UsageBucketTypes';

const PRIVATE_WORDS = ['micro', 'allowance', 'cost', 'price', 'token', 'model', 'reserved', 'margin', 'gemini', 'provider', 'usd', 'discrepanc', 'breaker'];

describe('customer-safe usage data (Q)', () => {
  it('keeps only customer fields, even if the server response ever carried private ones', () => {
    const raw = {
      plan: { productKey: 'pro_monthly', label: 'Pro plan', private_allowance_micro_usd: 10_000_000 },
      bucketFunded: true,
      buckets: [{
        id: 'b1', type: 'monthly_plan', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 500, pcRemaining: 1500,
        percentUsed: 25, status: 'active', startsAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-31T00:00:00Z', resetsAt: '2026-10-31T00:00:00Z',
        private_allowance_micro_usd: 10_000_000, consumed_micro_usd: 2_500_000, reserved_micro_usd: 98_000, model: 'gemini-3.1-pro-preview', costUsd: 2.5,
      }],
      weeklyPacing: { percentUsed: 50, reached: false, resetsAt: '2026-10-08T00:00:00Z', pcLimit: 1000, weekly_pacing_micro_usd: 5_000_000 },
      creditsPcRemaining: 0,
      limitReached: false,
      limitReason: null,
      limitResetsAt: null,
      providerCostUsd: 2.5,
      modelPrices: [{ model: 'gemini-3.1-pro-preview', input: 2 }],
      discrepancies: [],
    };
    const safe = toCustomerUsageSummary(raw);
    const text = JSON.stringify(safe).toLowerCase();
    expect(PRIVATE_WORDS.filter((w) => text.includes(w))).toEqual([]);
    expect(safe.buckets[0]).toMatchObject({ pcTotal: 2000, pcRemaining: 1500, percentUsed: 25, amountPaidCents: 2000 });
    expect(safe.weeklyPacing?.pcLimit).toBe(1000);
  });

  it('future product keys pass through unchanged (the type system rejects no product)', () => {
    const safe = toCustomerUsageSummary({
      plan: { productKey: 'galaxy_unlimited_2030', label: 'Galaxy plan' },
      bucketFunded: true,
      buckets: [{ id: 'b', type: 'monthly_plan', status: 'active', productKey: 'galaxy_unlimited_2030', label: 'Galaxy plan', pcTotal: 123456 }],
    });
    expect(safe.plan).toEqual({ productKey: 'galaxy_unlimited_2030', label: 'Galaxy plan' });
    expect(safe.bucketFunded).toBe(true);
    expect(safe.buckets[0].productKey).toBe('galaxy_unlimited_2030');
    expect(toCustomerUsageSummary({ bucketFunded: 'yes' }).bucketFunded).toBe(false);
  });

  it('drops unknown bucket types/statuses and keeps history to date, category, bucket type and PC', () => {
    expect(toCustomerUsageSummary({ buckets: [{ id: 'x', type: 'secret', status: 'active' }] }).buckets).toEqual([]);
    const history = toCustomerUsageHistory([{ at: '2026-10-01T00:00:00Z', category: 'chat', bucketType: 'purchased_credits', pc: 1.5, charged_micro_usd: 10500, model: 'x' }]);
    expect(history).toEqual([{ at: '2026-10-01T00:00:00Z', category: 'chat', bucketType: 'purchased_credits', pc: 1.5 }]);
  });

  it('limit messages never mention money, cost or allowance', () => {
    for (const reason of ['plan_weekly_paced', 'plan_exhausted', 'no_allowance', 'service_unavailable'] as const) {
      const message = usageLimitMessage(reason, '2026-10-08T00:00:00Z').toLowerCase();
      expect(message).not.toMatch(/\$|cost|allowance|gemini|token|price/);
    }
    expect(usageLimitMessage('plan_weekly_paced')).toMatch(/^Weekly limit reached/);
  });
});
