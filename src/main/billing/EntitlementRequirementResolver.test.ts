import { afterEach, describe, expect, it, vi } from 'vitest';
import { entitlementRequirementResolver } from './EntitlementRequirementResolver';
import { subscriptionStore } from './SubscriptionStore';

describe('entitlementRequirementResolver', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves satisfied when the current tier has the requested feature', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await entitlementRequirementResolver.resolve({ kind: 'entitlement', feature: 'advancedRuntimes' }, {});

    expect(result.satisfied).toBe(true);
    expect(result.blockingResult).toBeUndefined();
  });

  it('resolves unsatisfied with reason entitlement-restricted when the tier lacks the feature', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await entitlementRequirementResolver.resolve({ kind: 'entitlement', feature: 'advancedRuntimes' }, {});

    expect(result.satisfied).toBe(false);
    expect(result.blockingResult?.ok).toBe(false);
    if (result.blockingResult && !result.blockingResult.ok) {
      expect(result.blockingResult.reason).toBe('entitlement-restricted');
    }
  });

  it('uses the provided reasonHint as the blocking message', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await entitlementRequirementResolver.resolve(
      { kind: 'entitlement', feature: 'connectJira', reasonHint: 'Creating an execution plan requires Paw Pro.' },
      {}
    );

    expect(result.blockingResult && !result.blockingResult.ok ? result.blockingResult.message : undefined).toBe(
      'Creating an execution plan requires Paw Pro.'
    );
  });

  it('falls back to a generic message when no reasonHint is given', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await entitlementRequirementResolver.resolve({ kind: 'entitlement', feature: 'connectJira' }, {});

    expect(result.blockingResult && !result.blockingResult.ok ? result.blockingResult.message : undefined).toBe(
      'This action requires a higher Paw plan.'
    );
  });

  it('resolves satisfied when the current account has the requested runtime entitlement', async () => {
    const runtimeEntitlements = [{ runtimeId: 'coding' as const, source: 'purchase' as const, grantedAt: 1 }];
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active', runtimeEntitlements });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue(runtimeEntitlements);

    const result = await entitlementRequirementResolver.resolve({ kind: 'entitlement', runtimeId: 'coding' }, {});

    expect(result.satisfied).toBe(true);
  });

  it('resolves unsatisfied when the current account lacks the requested runtime entitlement', async () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await entitlementRequirementResolver.resolve({ kind: 'entitlement', runtimeId: 'coding' }, {});

    expect(result.satisfied).toBe(false);
    expect(result.blockingResult && !result.blockingResult.ok ? result.blockingResult.message : undefined).toBe(
      'This action requires a plan that supports it.'
    );
  });
});
