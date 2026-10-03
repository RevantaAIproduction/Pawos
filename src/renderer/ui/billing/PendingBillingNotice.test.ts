import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../services/ipc/ipcBridgeImplementation', () => ({ ipc: {} }));
vi.mock('../../auth/supabaseClient', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../Dashboard/sections/CreditsPaymentHandler', () => ({ initiateMidMonthPayment: vi.fn() }));

import { PendingBillingCard, formatBillingPrice, isPendingBilling } from './PendingBillingNotice';
import { usageLimitMessage, type UsageLimitReason } from '../../../shared/billing/UsageBucketTypes';
import type { EntitlementSnapshot } from '../../../shared/billing/BillingTypes';

const snapshot = (limitReason: UsageLimitReason | null, pooled = false) =>
  ({ pooled, usageSummary: { limitReason, bucketFunded: true, buckets: [] } }) as unknown as EntitlementSnapshot;

describe('pending billing — shown only once the plan and every credit are used up', () => {
  it('appears for the server reason plan_exhausted only', () => {
    expect(isPendingBilling(snapshot('plan_exhausted'))).toBe(true);
    // Weekly limit: the rest of the plan comes back at the reset — no payment asked.
    expect(isPendingBilling(snapshot('plan_weekly_paced'))).toBe(false);
    // Go/Build or no plan: the regular notice (upgrade / buy credits).
    expect(isPendingBilling(snapshot('no_allowance'))).toBe(false);
    expect(isPendingBilling(snapshot('service_unavailable'))).toBe(false);
    // Still working (plan or credits left).
    expect(isPendingBilling(snapshot(null))).toBe(false);
    // Team/Enterprise pooled usage never gets a personal payment.
    expect(isPendingBilling(snapshot('plan_exhausted', true))).toBe(false);
    expect(isPendingBilling(null)).toBe(false);
  });

  it('shows the price and renewal date — never PC, extra usage or private values', () => {
    const html = renderToStaticMarkup(
      React.createElement(PendingBillingCard, {
        amountUsd: 15,
        activeUntil: '2026-10-31T00:00:00Z',
        busy: false,
        message: null,
        onCompleteBilling: () => {},
        onDismiss: () => {},
      })
    );
    expect(html).toContain('Pending billing');
    expect(html).toContain('Complete billing — $15');
    expect(html).toMatch(/until your plan renews on /);
    expect(html).not.toMatch(/\bPC\b|1,500|Paw Compute/);
    expect(html.toLowerCase()).not.toMatch(/extra usage|mid-?month|allowance|provider|cost/);
  });

  it('formats Pro Max prices the same way', () => {
    expect(formatBillingPrice(50)).toBe('$50');
    expect(formatBillingPrice(175)).toBe('$175');
    expect(formatBillingPrice(12.5)).toBe('$12.50');
  });

  it('the server-side limit message asks for billing, not PC or extra usage', () => {
    const message = usageLimitMessage('plan_exhausted');
    expect(message).toMatch(/^Pending billing\n/);
    expect(message).toContain('Complete billing');
    expect(message).not.toMatch(/\bPC\b|\$/);
    expect(message.toLowerCase()).not.toMatch(/extra usage|mid-?month/);
  });
});
