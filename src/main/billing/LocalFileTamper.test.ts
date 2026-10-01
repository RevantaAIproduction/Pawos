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
    expect(pawComputeCapacityStore.resolve('go')).toMatchObject({ window5hPc: 500, windowWeeklyPc: 500 });
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

  it('credits.json cannot grant purchased Paw Compute — there is no local purchased balance at all', () => {
    writeBillingFile('credits.json', { userId: 'someone', purchasedUsageCreditsUsd: 99_999 });
    creditStore.init();
    expect('purchasedUsageCreditsUsd' in creditStore.getBalance()).toBe(false);
  });

  it('saved legacy unsent deductions are dropped on load — never sent to the frozen legacy deduction', () => {
    writeBillingFile('credits.json', {
      pendingDeductions: [
        { usageEventId: 'evt-a', amountUsd: 1, timestamp: 1, userId: 'user-a' },
        { usageEventId: 'evt-b', amountUsd: 2, timestamp: 2, userId: 'user-b' },
      ],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    creditStore.init();
    expect(fetchMock).not.toHaveBeenCalled();
    const saved = JSON.parse(fs.readFileSync(path.join(userData, 'billing', 'credits.json'), 'utf-8'));
    expect(saved.pendingDeductions).toBeUndefined();
  });
});
