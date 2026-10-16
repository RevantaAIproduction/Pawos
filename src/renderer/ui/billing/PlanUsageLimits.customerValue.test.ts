import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanUsageLimits } from './PlanUsageLimits';
import type { EntitlementSnapshot } from '../../../shared/billing/BillingTypes';
import type { CustomerUsageBucket, CustomerUsageSummary } from '../../../shared/billing/UsageBucketTypes';

const bucket = (b: Partial<CustomerUsageBucket>): CustomerUsageBucket => ({
  id: 'b', type: 'monthly_plan', label: '', amountPaidCents: 0, pcTotal: 0, pcUsed: 0, pcRemaining: 0, percentUsed: 0,
  status: 'active', startsAt: null, expiresAt: null, resetsAt: null, productKey: null, ...b,
});

function render(buckets: CustomerUsageBucket[]) {
  const usageSummary: CustomerUsageSummary = {
    plan: { productKey: 'pro_monthly', label: 'Pro plan' }, bucketFunded: true, buckets,
    weeklyPacing: { percentUsed: 10, reached: false, resetsAt: null, pcLimit: 1000 },
    creditsPcRemaining: 1000, limitReached: false, limitReason: null, limitResetsAt: null,
  };
  const entitlement = {
    tier: 'pro', pooled: false, hasCreditsRemaining: true, usage5hPc: 0, limit5hPc: null, usageWeeklyPc: 100, limitWeeklyPc: 1000,
    activeHours5h: null, activeHoursWeekly: null, activeHoursUsed5h: 0, activeHoursUsed7d: 0, usageWindowResetsAt: null,
    usageWeekResetsAt: Date.now() + 86_400_000, usageSummary,
  } as unknown as EntitlementSnapshot;
  return renderToStaticMarkup(React.createElement(PlanUsageLimits, { entitlement }));
}

describe('customers see the product price and PC — never the private allowance', () => {
  it('Pro: "$20" and "2,000 PC"; credits "$10" / "1,000 PC"; completed billing shows its price only', () => {
    const html = render([
      bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 200, pcRemaining: 1800 }),
      bucket({ id: 'm', type: 'mid_month_purchase', label: 'Pro extra usage', amountPaidCents: 1500, pcTotal: 1500, expiresAt: '2026-10-31T00:00:00Z' }),
      bucket({ id: 'c', type: 'purchased_credits', label: 'Credits', amountPaidCents: 1000, pcTotal: 1000 }),
    ]);
    expect(html).toContain('Pro plan · $20');
    expect(html).toContain('2,000 PC');
    // Pending billing that was paid: price and end date, never the PC it funds or its internal name.
    expect(html).toContain('Billing · $15 paid · until');
    expect(html).not.toContain('Pro extra usage');
    expect(html).not.toContain('1,500 PC');
    expect(html).not.toMatch(/1,500|1500/);
    expect(html.toLowerCase()).not.toMatch(/extra usage|mid-?month/);
    expect(html).toContain('Credits · $10');
    expect(html).toContain('1,000 PC');
    // The private allowances ($10 / $9 / $7) never appear, and nothing is added together.
    expect(html).not.toMatch(/\$7\b|\$9\b|\$30\b|\$45\b/);
    expect(html.toLowerCase()).not.toMatch(/allowance|provider|cost/);
  });

  it('legacy migrated credits: $10 / 1,000 PC remaining / no expiry — never the $7 allowance', () => {
    const html = render([bucket({ id: 'l', type: 'purchased_credits', label: 'Credits', amountPaidCents: 1000, pcTotal: 1000, pcRemaining: 1000 })]);
    expect(html).toContain('Credits · $10');
    expect(html).toContain('0 PC / 1,000 PC');
    expect(html).toContain('no expiry');
    expect(html).not.toMatch(/\$7\b/);
  });

  it('the plan and purchase bars show the percentage the server gives, not one worked out from PC here', () => {
    // The server decides both: at 97% a Pro plan is shown as 1,940 of 2,000 PC ($19.40 of $20).
    const html = render([
      bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 1940, pcRemaining: 60, percentUsed: 97 }),
      bucket({ id: 'c', type: 'purchased_credits', label: 'Credits', amountPaidCents: 1000, pcTotal: 1000, pcUsed: 1000, pcRemaining: 0, percentUsed: 100 }),
    ]);
    expect(html).toContain('Pro plan · $20');
    expect(html).toContain('1,940 PC / 2,000 PC · 97%');
    expect(html).toContain('width:97%');
    expect(html).toContain('1,000 PC / 1,000 PC · 100%');
    // Even if the two ever disagreed, the bar is the server's percentage — not one worked out here.
    const odd = render([bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 1900, pcRemaining: 100, percentUsed: 97 })]);
    expect(odd).toContain('1,900 PC / 2,000 PC · 97%');
    expect(odd).not.toContain('· 95%');
    // The weekly row has no server percentage for PC and keeps its own (100 of 1,000 PC).
    expect(html).toContain('100 PC / 1,000 PC · 10%');
  });

  it('a percentage outside 0–100 from anywhere is never drawn as one', () => {
    const html = render([bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 2000, percentUsed: 250 })]);
    expect(html).toContain('· 100%');
    expect(html).not.toContain('250%');
  });

  it('a missing or unusable percentage falls back to the PC numbers — never "NaN%" or a blank bar', () => {
    for (const percentUsed of [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number, null as unknown as number, '50' as unknown as number]) {
      const html = render([bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 500, pcRemaining: 1500, percentUsed })]);
      expect(html).toContain('500 PC / 2,000 PC · 25%');
      expect(html).not.toMatch(/NaN|Infinity|undefined|null%/);
    }
    const negative = render([bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 500, percentUsed: -5 })]);
    expect(negative).toContain('· 0%');
  });

  it.each([
    ['Pro at 90%', 2000, 1800, 90, '$20'],
    ['Pro at 97%', 2000, 1940, 97, '$20'],
    ['Pro at 100%', 2000, 2000, 100, '$20'],
    ['Pro Max 5x at 97%', 10000, 9700, 97, '$100'],
    ['Pro Max 20x at 97%', 25000, 24250, 97, '$250'],
    ['Pro Max 20x at 100%', 25000, 25000, 100, '$250'],
  ])('%s: the price, the PC and the percentage the server gave', (_name, pcTotal, pcUsed, percentUsed, price) => {
    const html = render([bucket({ id: 'p', label: 'Plan', amountPaidCents: pcTotal, pcTotal, pcUsed, pcRemaining: pcTotal - pcUsed, percentUsed })]);
    expect(html).toContain(`Plan · ${price}`);
    expect(html).toContain(`${pcUsed.toLocaleString()} PC / ${pcTotal.toLocaleString()} PC · ${percentUsed}%`);
    expect(html.toLowerCase()).not.toMatch(/allowance|provider|cost|micro/);
  });

  it('100% shown is a display, not a verdict: the row says nothing about the plan being used up', () => {
    // $9.80 of the private $10: the server shows 100% and 2,000 of 2,000 PC while the plan is still active.
    const html = render([bucket({ id: 'p', label: 'Pro plan', amountPaidCents: 2000, pcTotal: 2000, pcUsed: 2000, pcRemaining: 0, percentUsed: 100, status: 'active' })]);
    expect(html).toContain('2,000 PC / 2,000 PC · 100%');
    expect(html.toLowerCase()).not.toMatch(/limit reached|used up|exhausted/);
    expect(html.toLowerCase()).not.toMatch(/allowance|provider|cost|micro/);
  });

  it('Pro Max 20x shows $250 / 25,000 PC', () => {
    const html = render([bucket({ id: 'x', label: 'Pro Max 20x plan', amountPaidCents: 25000, pcTotal: 25000 })]);
    expect(html).toContain('Pro Max 20x plan · $250');
    expect(html).toContain('25,000 PC');
    expect(html).not.toContain('$125');
  });
});
