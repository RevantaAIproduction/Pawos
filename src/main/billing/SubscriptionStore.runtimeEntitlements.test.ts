import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-subscription-runtime-entitlements-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected app path: ${name}`);
      return userDataDir;
    },
  },
}));

describe('SubscriptionStore — runtime entitlement grants', () => {
  beforeEach(async () => {
    vi.resetModules();
    fs.rmSync(path.join(userDataDir, 'billing'), { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps an existing runtime entitlement active when another runtime is added', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.addRuntimeEntitlements(['coding'], 'order-1');
    subscriptionStore.addRuntimeEntitlements(['office'], 'order-2');

    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toEqual(['coding', 'office']);
  });

  it('does not create duplicate runtime entitlement state for repeated purchases', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.addRuntimeEntitlements(['coding', 'coding'], 'order-1');
    subscriptionStore.addRuntimeEntitlements(['coding'], 'order-2');

    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toEqual(['coding']);
  });

  it('does not automatically grant every runtime when a new individual Pro purchase completes', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.confirmPurchase('pro');

    expect(subscriptionStore.get().tier).toBe('pro');
    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });

  it('grants only purchasable requested runtimes through a verified purchase confirmation', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding', 'office'], orderId: 'order-1' });

    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toMatchObject([
      { runtimeId: 'coding', source: 'purchase', orderId: 'order-1' },
    ]);
  });

  it('keeps cumulative purchases and ignores duplicate callbacks', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding'], orderId: 'order-1' });
    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding'], orderId: 'order-1' });

    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toEqual(['coding']);
  });

  it('represents newly requested runtimes separately from already purchased runtimes', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.addRuntimeEntitlements(['coding'], 'order-1');

    expect(subscriptionStore.diffRuntimeEntitlements(['coding', 'browser', 'communication', 'browser'])).toEqual([
      'browser',
      'communication',
    ]);
  });

  it('grandfathers legacy active individual paid subscriptions into explicit plan grants', async () => {
    const filePath = path.join(userDataDir, 'billing', 'subscription.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ tier: 'pro', status: 'active' }), 'utf-8');

    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    const state = subscriptionStore.get();
    expect(state.runtimeEntitlementPolicyVersion).toBe(1);
    expect(state.runtimeEntitlementsGrandfatheredAt).toBeTypeOf('number');
    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toContain('coding');
    expect(subscriptionStore.getPurchasedRuntimeEntitlements().every((grant) => grant.source === 'plan')).toBe(true);
  });

  it('reconciles stale inactive Team state to authenticated Go instead of granting organization access', async () => {
    const filePath = path.join(userDataDir, 'billing', 'subscription.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({ tier: 'team', status: 'none', runtimeEntitlementPolicyVersion: 1 }),
      'utf-8'
    );

    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    const state = subscriptionStore.reconcileForAccount('acct-gmail');

    expect(state).toMatchObject({ tier: 'go', status: 'none', accountId: 'acct-gmail' });
    expect(subscriptionStore.getEffective().tier).toBe('go');
  });

  it('reconciles stale inactive Pro state to Go while preserving explicit purchase grants', async () => {
    const filePath = path.join(userDataDir, 'billing', 'subscription.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        tier: 'pro',
        status: 'none',
        runtimeEntitlementPolicyVersion: 1,
        runtimeEntitlements: [
          { runtimeId: 'coding', source: 'purchase', grantedAt: 1 },
          { runtimeId: 'office', source: 'plan', grantedAt: 2 },
        ],
      }),
      'utf-8'
    );

    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    const state = subscriptionStore.reconcileForAccount('acct-free');

    expect(state.tier).toBe('go');
    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toMatchObject([{ runtimeId: 'coding', source: 'purchase' }]);
  });

  it('keeps active Pro and Pro Max subscriptions for the authenticated owner', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding'], orderId: 'order-pro' });
    expect(subscriptionStore.reconcileForAccount('acct-paid').tier).toBe('pro');

    subscriptionStore.confirmPurchase('proMax');
    expect(subscriptionStore.reconcileForAccount('acct-paid').tier).toBe('proMax');
    expect(subscriptionStore.getPurchasedRuntimeEntitlements().map((grant) => grant.runtimeId)).toContain('coding');
  });

  it('does not let a different authenticated account inherit another account subscription or runtime grants', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.reconcileForAccount('acct-one');
    subscriptionStore.confirmPurchase('pro', { runtimeIds: ['coding'], orderId: 'order-one' });

    const state = subscriptionStore.reconcileForAccount('acct-two');

    expect(state).toMatchObject({ tier: 'go', status: 'none', accountId: 'acct-two' });
    expect(subscriptionStore.getPurchasedRuntimeEntitlements()).toEqual([]);
  });

  it('requires authoritative organization sync before Team or Enterprise becomes effective', async () => {
    const { subscriptionStore } = await import('./SubscriptionStore');
    subscriptionStore.init();

    subscriptionStore.reconcileForAccount('acct-member');
    expect(subscriptionStore.getEffective().tier).toBe('go');

    subscriptionStore.syncFromOrganization('team', 'standard');
    expect(subscriptionStore.getEffective()).toMatchObject({ tier: 'team', status: 'active', seatTier: 'standard' });

    subscriptionStore.syncFromOrganization('enterprise');
    expect(subscriptionStore.getEffective()).toMatchObject({ tier: 'enterprise', status: 'active' });
  });
});
