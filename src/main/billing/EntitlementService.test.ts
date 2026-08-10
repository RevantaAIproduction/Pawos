import { afterEach, describe, expect, it, vi } from 'vitest';
import { entitlementService } from './EntitlementService';
import { subscriptionStore } from './SubscriptionStore';

describe('EntitlementService — Go tier Think-not-Execute redesign', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives Go real model access (paw-flash) instead of zero models', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.getEntitlements().models).toContain('paw-flash');
    expect(entitlementService.isModelAvailable('paw-flash')).toBe(true);
  });

  it('caps Go credits at a real positive number — not 0 (no AI) and not null (unlimited)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const limit = entitlementService.getCreditLimit();
    expect(limit).not.toBeNull();
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBe(20);
  });

  it('does not grant advancedRuntimes (the Execute-class entitlement) to Go', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(false);
  });

  it('still reports hasCreditsRemaining() true when nothing has been consumed yet', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('is never reported as a pooled tier', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isComputePooled()).toBe(false);
  });
});

describe('EntitlementService — Paw Compute usage-limit enforcement (paid tiers)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Pro has a real, finite, positive monthly Paw Compute limit — not unlimited', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const limit = entitlementService.getCreditLimit();
    expect(limit).not.toBeNull();
    expect(limit).toBeGreaterThan(0);
  });

  it('Pro Max derives its limit as exactly 20x Pro, never a second hardcoded number', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const proLimit = entitlementService.getCreditLimit();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    const proMaxLimit = entitlementService.getCreditLimit();

    expect(proLimit).not.toBeNull();
    expect(proMaxLimit).toBe((proLimit as number) * 20);
  });

  it('Team Standard and Team Premium seats have different, real, per-seat monthly limits', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });
    const standardLimit = entitlementService.getCreditLimit();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'premium' });
    const premiumLimit = entitlementService.getCreditLimit();

    expect(standardLimit).not.toBeNull();
    expect(premiumLimit).not.toBeNull();
    expect(premiumLimit as number).toBeGreaterThan(standardLimit as number);
  });

  it('Enterprise is reported as pooled, and hasCreditsRemaining() stays true locally regardless of local CreditStore usage (the real check is server-side)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });

    expect(entitlementService.isComputePooled()).toBe(true);
    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('getSnapshot() reports pooled: false for every non-Enterprise paid tier', () => {
    for (const tier of ['pro', 'proMax', 'team'] as const) {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
      expect(entitlementService.getSnapshot().pooled).toBe(false);
    }
  });

  it('getSnapshot() reports pooled: true for Enterprise', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    expect(entitlementService.getSnapshot().pooled).toBe(true);
  });

  it.each(['pro', 'proMax', 'team', 'enterprise'] as const)('%s tier still grants advancedRuntimes', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(true);
  });
});
