import { describe, expect, it } from 'vitest';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';
import { formatPawComputeSummary, formatPlanAndRuntimeSummary } from './EntitlementDisplay';

const base: EntitlementSnapshot = {
  tier: 'pro',
  models: ['paw-flash'],
  features: [],
  runtimeEntitlements: ['coding'],
  creditLimit: 200,
  creditsUsedThisPeriod: 25,
  bonusComputeThisPeriod: 0,
  hasCreditsRemaining: true,
  pooled: false,
};

describe('EntitlementDisplay', () => {
  it('uses authoritative plan and runtime labels instead of model labels', () => {
    expect(formatPlanAndRuntimeSummary(base)).toBe('Paw Pro · Coding Runtime');
  });

  it('uses Paw Compute terminology and includes credit bonuses as compute extension only', () => {
    expect(formatPawComputeSummary({ ...base, bonusComputeThisPeriod: 50 })).toBe(
      'Used: 25 · Remaining: 225 · Limit: 200 · Paw Credits bonus: 50'
    );
  });

  it('renders Enterprise as pooled usage without inventing a local meter limit', () => {
    expect(formatPawComputeSummary({ ...base, tier: 'enterprise', pooled: true, creditLimit: null })).toBe(
      'Pooled organization allowance · Used: 25'
    );
  });
});
