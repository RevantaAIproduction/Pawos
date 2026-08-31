import { describe, expect, it } from 'vitest';
import type { EntitlementSnapshot } from '../../shared/billing/BillingTypes';
import { formatPawComputeSummary, formatPlanAndRuntimeSummary } from './EntitlementDisplay';

const base: EntitlementSnapshot = {
  tier: 'pro',
  models: ['paw-flash'],
  features: [],
  runtimeEntitlements: ['coding'],
  creditLimit: null,           // always null — deprecated, rolling windows are the enforcement system
  creditsUsedThisPeriod: 25,
  bonusComputeThisPeriod: 0,
  hasCreditsRemaining: true,
  pooled: false,
  weeklyCreditLimit: null,     // always null — deprecated, rolling windows are the enforcement system
  creditsUsedThisWeek: 0,
  weekResetsAt: 0,
  fableCreditsRemaining: 0,
  usage5hPc: 180,
  limit5hPc: 400,
  usageWeeklyPc: 640,
  limitWeeklyPc: 1_600,
  usageMonthlyPc: 1_500,
  limitMonthlyPc: 4_000,
};

describe('EntitlementDisplay', () => {
  it('uses authoritative plan and runtime labels instead of model labels', () => {
    expect(formatPlanAndRuntimeSummary(base)).toBe('Paw Pro · Coding Runtime');
  });

  it('shows rolling window usage/limit for both 5h and weekly windows', () => {
    expect(formatPawComputeSummary(base)).toBe('5h: 180 / 400 PC · Week: 640 / 1,600 PC');
  });

  it('uses usage5hPc and limit5hPc for the 5-hour window — never the deprecated creditLimit', () => {
    expect(formatPawComputeSummary({ ...base, usage5hPc: 50, limit5hPc: 400 })).toBe(
      '5h: 50 / 400 PC · Week: 640 / 1,600 PC'
    );
  });

  it('uses usageWeeklyPc and limitWeeklyPc for the weekly window — never the deprecated weeklyCreditLimit', () => {
    expect(formatPawComputeSummary({ ...base, usageWeeklyPc: 100, limitWeeklyPc: 1_600 })).toBe(
      '5h: 180 / 400 PC · Week: 100 / 1,600 PC'
    );
  });

  it('does not display "Unlimited Paw Compute" for a Pro tier with finite rolling-window limits', () => {
    expect(formatPawComputeSummary(base)).not.toContain('Unlimited');
  });

  it('omits the limit for a window that has no cap (null) without showing "Unlimited"', () => {
    const result = formatPawComputeSummary({ ...base, limit5hPc: null, limitWeeklyPc: null });
    expect(result).not.toContain('Unlimited');
    expect(result).toBe('5h: 180 PC · Week: 640 PC');
  });

  it('renders Enterprise as pooled usage without inventing a local meter limit or percentage', () => {
    expect(formatPawComputeSummary({ ...base, tier: 'enterprise', pooled: true })).toBe(
      'Pooled organization allowance · 25 used'
    );
  });
});
