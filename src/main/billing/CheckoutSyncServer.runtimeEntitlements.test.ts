import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-checkout-runtime-entitlements-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected app path: ${name}`);
      return userDataDir;
    },
  },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: vi.fn() } }],
  },
}));

function withParams(callback: string, params: Record<string, string>): string {
  const url = new URL(callback);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * P0-3 security fix: the callback no longer carries a trusted `plan` string — it carries a real
 * Razorpay (paymentId, subscriptionId, signature) triple that CheckoutSyncServer independently
 * re-verifies against pawos-web's /api/billing/verify-subscription route (a real network call,
 * mocked here). Only that one outbound call is intercepted — the test's own `fetch()` calls against
 * the real local loopback callback server must still go through unmocked, so this wraps the real
 * `fetch` rather than replacing it wholesale.
 */
function mockVerifySubscriptionFetch(response: unknown): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (typeof url === 'string' && url.includes('/api/billing/verify-subscription')) {
        return Promise.resolve({ ok: true, json: async () => response } as Response);
      }
      return realFetch(input, init);
    })
  );
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('CheckoutSyncServer runtime entitlement callback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    fs.rmSync(path.join(userDataDir, 'billing'), { recursive: true, force: true });
  });

  it('grants only requested purchasable runtimes after the existing checkout callback fires', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();
    mockVerifySubscriptionFetch({ ok: true, tier: 'pro', subscriptionId: 'order-1', runtimeIds: ['coding', 'office'] });

    const callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { paymentId: 'pay_1', subscriptionId: 'sub_1', signature: 'sig_1' }));
    await flushAsyncWork();

    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toMatchObject([
      { runtimeId: 'coding', source: 'purchase', orderId: 'order-1' },
    ]);
  });

  it('ignores duplicate runtime purchase callbacks', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();
    mockVerifySubscriptionFetch({ ok: true, tier: 'pro', subscriptionId: 'order-1', runtimeIds: ['coding'] });

    let callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { paymentId: 'pay_1', subscriptionId: 'sub_1', signature: 'sig_1' }));
    await flushAsyncWork();
    callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { paymentId: 'pay_2', subscriptionId: 'sub_1', signature: 'sig_2' }));
    await flushAsyncWork();

    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toEqual(['coding']);
  });

  it('does not grant runtime entitlements for a credits checkout callback', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    const callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { type: 'credits', amountUsd: '100', runtimeIds: 'coding' }));
    await flushAsyncWork();

    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });

  it('does not grant runtime entitlements from an unverified callback without the server token', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    const callback = await startCheckoutCallbackServer();
    const forged = new URL(callback);
    forged.searchParams.delete('token');
    forged.searchParams.set('paymentId', 'pay_1');
    forged.searchParams.set('subscriptionId', 'sub_1');
    forged.searchParams.set('signature', 'sig_1');
    const response = await fetch(forged.toString());
    await fetch(withParams(callback, { type: 'credits', amountUsd: '1' }));
    await flushAsyncWork();

    expect(response.status).toBe(403);
    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });

  it('rejects a callback whose signature the backend could not verify, even with a plausible tier claim', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();
    mockVerifySubscriptionFetch({ ok: false, reason: 'Invalid payment signature.' });

    const callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { paymentId: 'pay_forged', subscriptionId: 'sub_forged', signature: 'forged' }));
    await flushAsyncWork();

    expect(subscriptionStore.get().tier).toBe('go');
  });
});
