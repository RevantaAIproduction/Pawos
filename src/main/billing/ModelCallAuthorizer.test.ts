import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeModelCall } from './ModelCallAuthorizer';
import { entitlementService } from './EntitlementService';
import { rollingUsageGate } from './RollingUsageGate';
import { UsageBucketClient } from './UsageBucketClient';
import { EMPTY_USAGE_SUMMARY, type CustomerUsageSummary } from '../../shared/billing/UsageBucketTypes';

const request = { requestKey: 'k', model: 'gemini-3.5-flash-lite', inputTokens: 100, inputIsUpperBound: false, maxOutputTokens: 8000 };

function clientWith(summary: CustomerUsageSummary | null) {
  const client = new UsageBucketClient((async () => null) as never);
  vi.spyOn(client, 'getCachedSummary').mockReturnValue(summary);
  vi.spyOn(client, 'refreshSummary').mockResolvedValue(summary);
  const reserve = vi.spyOn(client, 'reserve').mockResolvedValue({ ok: true, reservationId: 'res', maxOutputTokens: 2048 });
  return { client, reserve };
}

const funded = (productKey = 'pro_monthly'): CustomerUsageSummary => ({ ...EMPTY_USAGE_SUMMARY, plan: { productKey, label: 'Plan' }, bucketFunded: true });

function account(opts: { tier: string; pooled?: boolean; paid?: boolean }) {
  vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue(opts.tier as never);
  vi.spyOn(entitlementService, 'isPooledUsage').mockReturnValue(opts.pooled ?? false);
  vi.spyOn(entitlementService, 'hasPaidSubscription').mockReturnValue(opts.paid ?? false);
}

afterEach(() => vi.restoreAllMocks());

describe('authorizeModelCall — the server configuration decides, never the tier name', () => {
  it('any account whose summary says bucketFunded is reserved (plan → extra usage → credits), whatever its tier', async () => {
    for (const tier of ['pro', 'proMax', 'go', 'someFutureTier']) {
      account({ tier });
      const { client, reserve } = clientWith(funded(`${tier}_product`));
      expect(await authorizeModelCall(request, { client })).toEqual({ ok: true, reservationId: 'res', maxOutputTokens: 2048 });
      expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ requestKey: 'k' }), 'standard');
      vi.restoreAllMocks();
    }
  });

  it('Paw Fable on a bucket-funded account uses credits only', async () => {
    account({ tier: 'pro', paid: true });
    const { client, reserve } = clientWith(funded());
    await authorizeModelCall({ ...request, pawModelId: 'paw-fable' }, { client });
    expect(reserve).toHaveBeenCalledWith(expect.anything(), 'credits_only');
  });

  it('a paid subscription without a current plan bucket continues on credits only', async () => {
    account({ tier: 'pro', paid: true });
    const { client, reserve } = clientWith({ ...EMPTY_USAGE_SUMMARY, creditsPcRemaining: 500 });
    await authorizeModelCall(request, { client });
    expect(reserve).toHaveBeenCalledWith(expect.anything(), 'credits_only');
  });

  it('a paid subscription whose summary cannot be loaded is refused (fail closed), never treated as free', async () => {
    account({ tier: 'pro', paid: true });
    const { client, reserve } = clientWith(null);
    expect(await authorizeModelCall(request, { client })).toMatchObject({ ok: false, reason: 'service_unavailable' });
    expect(reserve).not.toHaveBeenCalled();
  });

  it('no paid subscription, within the free allowance: no reservation (Go/Build unchanged)', async () => {
    account({ tier: 'go' });
    vi.spyOn(rollingUsageGate, 'checkIncludedCapacity').mockReturnValue({ allowed: true, pooled: false } as never);
    const { client, reserve } = clientWith(EMPTY_USAGE_SUMMARY);
    expect(await authorizeModelCall(request, { client })).toEqual({ ok: true, reservationId: null, maxOutputTokens: 8000 });
    expect(reserve).not.toHaveBeenCalled();
  });

  it('no paid subscription, past the free allowance: credits only; final Build week refused', async () => {
    account({ tier: 'build' });
    vi.spyOn(rollingUsageGate, 'checkIncludedCapacity').mockReturnValue({ allowed: false, pooled: false, reason: 'limit' } as never);
    const final = vi.spyOn(rollingUsageGate, 'isBuildFinalWeek').mockReturnValue(false);
    const { client, reserve } = clientWith(EMPTY_USAGE_SUMMARY);
    await authorizeModelCall(request, { client });
    expect(reserve).toHaveBeenCalledWith(expect.anything(), 'credits_only');
    final.mockReturnValue(true);
    reserve.mockClear();
    expect(await authorizeModelCall(request, { client })).toMatchObject({ ok: false });
    expect(reserve).not.toHaveBeenCalled();
  });

  it('Team / Enterprise pooled usage is unchanged — no reservation, even if a summary existed', async () => {
    for (const tier of ['team', 'enterprise']) {
      account({ tier, pooled: true });
      const { client, reserve } = clientWith(funded());
      expect(await authorizeModelCall(request, { client })).toMatchObject({ ok: true, reservationId: null });
      expect(reserve).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it('passes the call\'s own output ceiling through (the server clamps it to its engine settings)', async () => {
    account({ tier: 'pro', paid: true });
    const { client, reserve } = clientWith(funded());
    await authorizeModelCall({ ...request, maxOutputTokens: 65_000 }, { client });
    expect(reserve).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 65_000 }), 'standard');
  });
});
