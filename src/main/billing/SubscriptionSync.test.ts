import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { subscriptionStore } from './SubscriptionStore';
import { resetRestoreAttemptsForTests, syncSubscriptionFromServer } from './SubscriptionSync';
import { setServerAccessToken } from '../auth/ServerSessionToken';

const DAY = 24 * 60 * 60 * 1000;
const PAID = 'user-paid';   // e.g. tharun.esta@gmail.com
const FREE = 'user-free';

type ServerRow = { active: boolean; tier?: 'pro' | 'proMax'; proMaxVariant?: '5x' | '20x' | null; expiresAt?: number; hasHistory: boolean };

/** Fake Supabase: get_my_subscription answers for whichever account's token is current. */
function serveSubscriptions(rows: Record<string, ServerRow>) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const token = String((init?.headers as Record<string, string>).Authorization).replace('Bearer ', '');
    const row = rows[token] ?? { active: false, hasHistory: false };
    return new Response(
      JSON.stringify({
        userId: token,
        active: row.active,
        tier: row.tier ?? null,
        proMaxVariant: row.proMaxVariant ?? null,
        status: row.active ? 'active' : null,
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        hasHistory: row.hasHistory,
        serverNow: new Date().toISOString(),
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** What the app does on sign-in: reconcile the local cache for the account, then sync with the server. */
async function signIn(accountId: string) {
  setServerAccessToken(accountId); // the fake server uses the token as the user id
  subscriptionStore.reconcileForAccount(accountId);
  return syncSubscriptionFromServer(() => {});
}

/** What the app does on sign-out. */
function signOut() {
  subscriptionStore.reset();
  setServerAccessToken(null);
}

describe('Paid plan follows the account (server-backed)', () => {
  const env = { ...process.env };

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-subsync-'));
    subscriptionStore.init();
    subscriptionStore.reset();
    resetRestoreAttemptsForTests();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'anon-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setServerAccessToken(null);
    process.env = { ...env };
  });

  it('paid → sign out → free account → sign back in: the paid plan comes back', async () => {
    const expiresAt = Date.now() + 20 * DAY;
    serveSubscriptions({ [PAID]: { active: true, tier: 'proMax', proMaxVariant: '20x', expiresAt, hasHistory: true } });

    expect(await signIn(PAID)).toBe('applied');
    expect(subscriptionStore.getEffective()).toMatchObject({ tier: 'proMax', proMaxVariant: '20x', status: 'active', accountId: PAID });

    signOut();
    expect(await signIn(FREE)).toBe('unchanged');
    expect(subscriptionStore.getEffective().tier).toBe('go');

    signOut();
    expect(await signIn(PAID)).toBe('applied');
    const restored = subscriptionStore.getEffective();
    expect(restored).toMatchObject({ tier: 'proMax', proMaxVariant: '20x', status: 'active' });
    expect(Math.abs((restored.renewsAt ?? 0) - expiresAt)).toBeLessThan(2000);
  });

  it('the plan lasts only until it expires — after that the account is free again', async () => {
    serveSubscriptions({ [PAID]: { active: true, tier: 'pro', expiresAt: Date.now() + 5 * DAY, hasHistory: true } });
    await signIn(PAID);
    expect(subscriptionStore.getEffective().tier).toBe('pro');
    expect(subscriptionStore.getEffective(Date.now() + 5 * DAY + 60_000).tier).toBe('go');
  });

  it('a cancelled / lapsed plan the server knows about is removed on the next sync', async () => {
    serveSubscriptions({ [PAID]: { active: true, tier: 'pro', expiresAt: Date.now() + 5 * DAY, hasHistory: true } });
    await signIn(PAID);
    serveSubscriptions({ [PAID]: { active: false, hasHistory: true } });
    expect(await syncSubscriptionFromServer(() => {})).toBe('cleared');
    expect(subscriptionStore.getEffective().tier).toBe('go');
  });

  it('a renewal extends the plan on the next sync', async () => {
    serveSubscriptions({ [PAID]: { active: true, tier: 'pro', expiresAt: Date.now() + 2 * DAY, hasHistory: true } });
    await signIn(PAID);
    const renewed = Date.now() + 32 * DAY;
    serveSubscriptions({ [PAID]: { active: true, tier: 'pro', expiresAt: renewed, hasHistory: true } });
    await syncSubscriptionFromServer(() => {});
    expect(subscriptionStore.getEffective(Date.now() + 10 * DAY).tier).toBe('pro');
  });

  it('a hand-edited local file is overwritten by the server on sync', async () => {
    serveSubscriptions({ [FREE]: { active: false, hasHistory: true } });
    setServerAccessToken(FREE);
    subscriptionStore.reconcileForAccount(FREE);
    subscriptionStore.confirmPurchase('proMax', { proMaxVariant: '20x' }); // stands in for an edited subscription.json
    expect(subscriptionStore.getEffective().tier).toBe('proMax');
    await syncSubscriptionFromServer(() => {});
    expect(subscriptionStore.getEffective().tier).toBe('go');
  });

  it('offline or server error: keeps the local plan, never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serveSubscriptions({ [PAID]: { active: true, tier: 'pro', expiresAt: Date.now() + 5 * DAY, hasHistory: true } });
    await signIn(PAID);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await syncSubscriptionFromServer(() => {})).toBe('error');
    expect(subscriptionStore.getEffective().tier).toBe('pro');
  });

  describe('restore purchases (plans bought before the server kept records)', () => {
    /** Fake Supabase + pawos-web: restore-subscription "finds" `found` for the account (or fails). */
    function serveWithRestore(found: ServerRow | null, restoreStatus = 200) {
      const rows: Record<string, ServerRow> = { [PAID]: { active: false, hasHistory: false } };
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/api/billing/restore-subscription')) {
          if (restoreStatus !== 200) return new Response('{}', { status: restoreStatus });
          if (found) rows[PAID] = found;
          return new Response(JSON.stringify({ ok: true, recorded: found ? 1 : 0 }), { status: 200 });
        }
        const token = String((init?.headers as Record<string, string>).Authorization).replace('Bearer ', '');
        const row = rows[token] ?? { active: false, hasHistory: false };
        return new Response(JSON.stringify({ userId: token, active: row.active, tier: row.tier ?? null, proMaxVariant: row.proMaxVariant ?? null, status: null, expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null, hasHistory: row.hasHistory, serverNow: new Date().toISOString() }), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    function holdLocalPaidPlan() {
      setServerAccessToken(PAID);
      subscriptionStore.reconcileForAccount(PAID);
      subscriptionStore.confirmPurchase('pro');
    }

    it('a real older purchase is recorded on the server, then restored from it', async () => {
      const expiresAt = Date.now() + 12 * DAY;
      const fetchMock = serveWithRestore({ active: true, tier: 'pro', expiresAt, hasHistory: true });
      holdLocalPaidPlan();
      expect(await syncSubscriptionFromServer(() => {})).toBe('applied');
      expect(subscriptionStore.get()).toMatchObject({ tier: 'pro', serverVerified: true });
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/billing/restore-subscription'))).toBe(true);
      // From now on it follows the account like any other plan.
      signOut();
      expect(await signIn(PAID)).toBe('applied');
      expect(subscriptionStore.getEffective().tier).toBe('pro');
    });

    it('a faked local plan (Razorpay has nothing for this account) is removed', async () => {
      serveWithRestore(null);
      holdLocalPaidPlan();
      expect(await syncSubscriptionFromServer(() => {})).toBe('cleared');
      expect(subscriptionStore.getEffective().tier).toBe('go');
    });

    it('a failed restore (server error) keeps the local plan and is not retried every refresh', async () => {
      const fetchMock = serveWithRestore(null, 502);
      holdLocalPaidPlan();
      expect(await syncSubscriptionFromServer(() => {})).toBe('unchanged');
      expect(subscriptionStore.getEffective().tier).toBe('pro');
      await syncSubscriptionFromServer(() => {});
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/billing/restore-subscription'))).toHaveLength(1);
    });

    it('free accounts never call restore', async () => {
      const fetchMock = serveWithRestore(null);
      expect(await signIn(FREE)).toBe('unchanged');
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/billing/restore-subscription'))).toBe(false);
    });
  });

  it('never replaces an active organization tier with a personal plan', () => {
    subscriptionStore.reconcileForAccount(PAID);
    subscriptionStore.confirmPurchase('team');
    subscriptionStore.applyServerSubscription(PAID, { tier: 'pro', expiresAt: Date.now() + DAY });
    expect(subscriptionStore.getEffective().tier).toBe('team');
  });
});
