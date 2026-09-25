import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import { pawComputeConfigStore } from './PawComputeConfigStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import { creditStore } from './CreditStore';

function writeBillingFile(name: string, value: unknown) {
  fs.mkdirSync(path.join(userData, 'billing'), { recursive: true });
  fs.writeFileSync(path.join(userData, 'billing', name), JSON.stringify(value), 'utf-8');
}

describe('Hand-edited files in the user data folder change nothing', () => {
  const env = { ...process.env };

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-tamper-'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...env };
  });

  it('paw-compute-capacity.json cannot raise any tier limit', () => {
    const huge = { window5hPc: 1e9, windowWeeklyPc: 1e9, window5hActiveHours: null, windowWeeklyActiveHours: null, pooled: false };
    writeBillingFile('paw-compute-capacity.json', { version: 4, tiers: { go: huge, pro: huge, proMax: huge, build: huge } });
    pawComputeCapacityStore.init();
    expect(pawComputeCapacityStore.resolve('go')).toMatchObject({ window5hPc: 1000, windowWeeklyPc: 1000 });
    expect(pawComputeCapacityStore.resolve('pro')).toMatchObject({ window5hPc: 1250, windowWeeklyPc: 5000 });
    expect(pawComputeCapacityStore.resolve('proMax', undefined, '20x')).toMatchObject({ windowWeeklyPc: 100_000 });
    expect(pawComputeCapacityStore.resolve('build')).toMatchObject({ window5hPc: 500, windowWeeklyPc: 1500 });
  });

  it('paw-compute-config.json cannot make requests cheaper', () => {
    writeBillingFile('paw-compute-config.json', { pawComputePerUsd: 0.000001, modelPricing: { default: { inputPerMillionUsd: 0, outputPerMillionUsd: 0, cachedInputPerMillionUsd: 0 } } });
    pawComputeConfigStore.init();
    expect(pawComputeConfigStore.getPawComputePerUsd()).toBe(1000);
    expect(pawComputeConfigStore.resolvePricing('something-unknown').outputPerMillionUsd).toBeGreaterThan(0);
  });

  it('usage-quota-config.json cannot raise quotas', () => {
    usageQuotaConfigStore.init();
    const builtIn = JSON.stringify(usageQuotaConfigStore.get());
    writeBillingFile('usage-quota-config.json', { quotas: {} , anything: 'edited' });
    usageQuotaConfigStore.init();
    expect(JSON.stringify(usageQuotaConfigStore.get())).toBe(builtIn);
  });

  it('credits.json cannot grant purchased Paw Compute — the balance only comes from the server', () => {
    writeBillingFile('credits.json', { userId: 'someone', purchasedUsageCreditsUsd: 99_999 });
    creditStore.init();
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(0);
  });

  it('a saved unsent deduction is only ever charged to the account that spent it', async () => {
    writeBillingFile('credits.json', {
      pendingDeductions: [
        { usageEventId: 'evt-a', amountUsd: 1, timestamp: 1, userId: 'user-a' },
        { usageEventId: 'evt-b', amountUsd: 2, timestamp: 2, userId: 'user-b' },
        { usageEventId: 'evt-legacy', amountUsd: 3, timestamp: 3 },
      ],
    });
    creditStore.init();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'anon-key';
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('deduct_usage_credits') ? new Response('5', { status: 200 }) : new Response(JSON.stringify([{ balance_usd: 10 }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await creditStore.syncUsageCredits('token-b', 'user-b');
    const deductions = fetchMock.mock.calls.filter(([url]) => String(url).includes('deduct_usage_credits'));
    expect(deductions).toHaveLength(1);
    expect(JSON.parse(String((deductions[0][1] as RequestInit).body))).toMatchObject({ p_usage_event_id: 'evt-b' });
    expect(creditStore.getBalance().purchasedUsageCreditsUsd).toBe(10);
  });
});
