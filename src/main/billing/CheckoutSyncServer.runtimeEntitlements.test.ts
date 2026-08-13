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

describe('CheckoutSyncServer runtime entitlement callback', () => {
  beforeEach(() => {
    vi.resetModules();
    fs.rmSync(path.join(userDataDir, 'billing'), { recursive: true, force: true });
  });

  it('grants only requested purchasable runtimes after the existing checkout callback fires', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    const callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { plan: 'pro', runtimeIds: 'coding,office', orderId: 'order-1' }));

    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toMatchObject([
      { runtimeId: 'coding', source: 'purchase', orderId: 'order-1' },
    ]);
  });

  it('ignores duplicate runtime purchase callbacks', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    let callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { plan: 'pro', runtimeIds: 'coding', orderId: 'order-1' }));
    callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { plan: 'pro', runtimeIds: 'coding', orderId: 'order-1' }));

    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toEqual(['coding']);
  });

  it('does not grant runtime entitlements for a credits checkout callback', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    const callback = await startCheckoutCallbackServer();
    await fetch(withParams(callback, { type: 'credits', amountUsd: '100', runtimeIds: 'coding' }));

    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });

  it('does not grant runtime entitlements from an unverified callback without the server token', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    const { startCheckoutCallbackServer } = await import('./CheckoutSyncServer');
    subscriptionStore.init();

    const callback = await startCheckoutCallbackServer();
    const forged = new URL(callback);
    forged.searchParams.delete('token');
    forged.searchParams.set('plan', 'pro');
    forged.searchParams.set('runtimeIds', 'coding');
    const response = await fetch(forged.toString());
    await fetch(withParams(callback, { type: 'credits', amountUsd: '1' }));

    expect(response.status).toBe(403);
    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });
});
