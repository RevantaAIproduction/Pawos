import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The stored connector credentials are written and read by Supabase as `auth.uid()` — the account
 * of THIS window's session — whatever user id the scope names. Mid-switch, that session can already
 * be the next account while the main process still has the previous one verified (a sign-out that
 * kept the session because it could not refresh it, then a sign-in: A → B with no signed-out step
 * in between). So every operation first checks that the scope is the session's own account; a
 * credential for another account never reaches Supabase.
 */

const A = 'user-a';
const B = 'user-b';
const session = vi.hoisted(() => ({ userId: null as string | null }));
const supabase = vi.hoisted(() => {
  const query = () => {
    const q: Record<string, unknown> = {};
    for (const step of ['select', 'delete', 'eq', 'is']) q[step] = vi.fn(() => q);
    q.returns = vi.fn(async () => ({ data: [], error: null }));
    q.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
    return q;
  };
  return {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: session.userId ? { access_token: `token-${session.userId}`, user: { id: session.userId } } : null },
        error: null,
      })),
    },
    // As in Postgres: both RPCs act as the session's own account (auth.uid()), never the scope's.
    rpc: vi.fn(async (name: string) =>
      name === 'read_connectivity_credential'
        ? { data: [{ auth_method: 'oauth2', secret: `${session.userId}-secret`, refresh_token: null, expires_at: null }], error: null }
        : { data: 'row-id', error: null }
    ),
    from: vi.fn(() => query()),
  };
});
vi.mock('../auth/supabaseClient', () => ({ getSupabaseClient: async () => supabase }));

const bridge = vi.hoisted(() => ({
  persist: undefined as undefined | ((request: unknown) => Promise<void>),
  revoke: undefined as undefined | ((request: unknown) => Promise<void>),
  persistRespond: vi.fn(async () => undefined),
  revokeRespond: vi.fn(async () => undefined),
}));
vi.mock('../services/ipc/ipcBridge', () => ({
  getIpcBridge: () => ({
    onConnectivityCredentialPersistRequest: (cb: (request: unknown) => Promise<void>) => (bridge.persist = cb),
    onConnectivityCredentialRevokeRequest: (cb: (request: unknown) => Promise<void>) => (bridge.revoke = cb),
    connectivityCredentialPersistRespond: bridge.persistRespond,
    connectivityCredentialRevokeRespond: bridge.revokeRespond,
  }),
}));

import { connectivityCredentialService } from './ConnectivityCredentialService';
import { installConnectivityCredentialBridge } from './ConnectivityCredentialBridge';

const scopeOf = (userId: string) => ({ userId });
const touchedSupabase = () => supabase.rpc.mock.calls.length + supabase.from.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  session.userId = null;
});

describe('the window persists a credential only for its own session’s account', () => {
  it("reproduction: main sends A's refreshed credential while the window's session is already B — refused, never stored as B's", async () => {
    installConnectivityCredentialBridge();
    session.userId = B; // A → B in the window; main has not verified B yet
    await bridge.persist!({ requestId: 'r1', scope: scopeOf(A), connectorId: 'linear', authMethod: 'oauth2', secret: 'a-refreshed-token' });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(bridge.persistRespond).toHaveBeenCalledWith('r1', { ok: false, message: expect.stringMatching(/isn't for the account signed in/) });
  });

  it("a revoke for A arriving while the window's session is B is refused (nothing deleted)", async () => {
    installConnectivityCredentialBridge();
    session.userId = B;
    await bridge.revoke!({ requestId: 'r2', scope: scopeOf(A), connectorId: 'linear' });
    expect(touchedSupabase()).toBe(0);
    expect(bridge.revokeRespond).toHaveBeenCalledWith('r2', { ok: false, message: expect.stringMatching(/isn't for the account signed in/) });
  });

  it('the same account: persist and revoke go through', async () => {
    installConnectivityCredentialBridge();
    session.userId = A;
    await bridge.persist!({ requestId: 'r3', scope: scopeOf(A), connectorId: 'linear', authMethod: 'oauth2', secret: 'a-token' });
    expect(bridge.persistRespond).toHaveBeenCalledWith('r3', { ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith('store_connectivity_credential', expect.objectContaining({ p_connector_id: 'linear', p_secret: 'a-token' }));
    await bridge.revoke!({ requestId: 'r4', scope: scopeOf(A), connectorId: 'linear' });
    expect(bridge.revokeRespond).toHaveBeenCalledWith('r4', { ok: true });
  });
});

describe('every credential operation belongs to the session’s account', () => {
  const operations = {
    listMetadata: (userId: string) => connectivityCredentialService.listMetadata(scopeOf(userId)),
    store: (userId: string) => connectivityCredentialService.store(scopeOf(userId), 'linear', 'oauth2', `${userId}-token`),
    read: (userId: string) => connectivityCredentialService.read(scopeOf(userId), 'linear'),
    revoke: (userId: string) => connectivityCredentialService.revoke(scopeOf(userId), 'linear'),
  };

  for (const [name, run] of Object.entries(operations)) {
    it(`${name}: refused for another account's scope and when signed out — nothing reaches Supabase`, async () => {
      session.userId = B;
      await expect(run(A)).rejects.toThrow(/isn't for the account signed in/);
      session.userId = null;
      await expect(run(A)).rejects.toThrow(/isn't for the account signed in/);
      expect(touchedSupabase()).toBe(0);
    });

    it(`${name}: A → B → A — each account's own scope goes through, the other's never`, async () => {
      session.userId = A;
      await expect(run(A)).resolves.not.toThrow();
      session.userId = B;
      await expect(run(A)).rejects.toThrow(/isn't for the account signed in/);
      await expect(run(B)).resolves.not.toThrow();
      session.userId = A;
      await expect(run(B)).rejects.toThrow(/isn't for the account signed in/);
      await expect(run(A)).resolves.not.toThrow();
      expect(touchedSupabase()).toBe(3);
    });
  }

  it("a read for A while the session is already B never returns B's credential (restore of an earlier session)", async () => {
    session.userId = B;
    await expect(connectivityCredentialService.read(scopeOf(A), 'linear')).rejects.toThrow(/isn't for the account signed in/);
    session.userId = A;
    expect(await connectivityCredentialService.read(scopeOf(A), 'linear')).toMatchObject({ secret: `${A}-secret` });
  });
});
