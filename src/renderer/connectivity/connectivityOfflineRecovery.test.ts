import { beforeEach, describe, expect, it, vi } from 'vitest';

// No DOM renderer here: React's useEffect runs its effect straight away (its cleanup is kept, so a
// test can unmount the Dashboard), so the real hook body runs as React would run it.
const effects = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) effects.cleanups.push(cleanup);
  },
}));

/**
 * Mocked network, Supabase and main process. `network.online` decides whether Supabase answers;
 * the main process verifies a session only while online, and refuses a restore for any account it
 * has not verified — exactly the shape of the real IPC replies.
 */
const world = vi.hoisted(() => ({
  online: true,
  rejectTokens: new Set<string>(),
  mainVerified: null as string | null,
  holdNextList: false,
  heldList: [] as (() => void)[],
  listsInFlight: 0,
  maxListsInFlight: 0,
}));
const userOf = (token: string) => token.split(':')[0];

const services = vi.hoisted(() => ({
  listMetadata: vi.fn(),
  read: vi.fn(async (scope: { userId: string }) => ({ authMethod: 'oauth2', secret: `${scope.userId}-secret` })),
  listConnections: vi.fn(async () => [] as unknown[]),
  listProfiles: vi.fn(async () => [] as unknown[]),
}));
const mainIpc = vi.hoisted(() => ({
  accountSetSession: vi.fn(),
  connectivityRestore: vi.fn(),
}));
vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: mainIpc }));
vi.mock('./ConnectionManagerService', () => ({ connectionManagerService: { list: services.listConnections, upsert: vi.fn() } }));
vi.mock('./ConnectivityCredentialService', () => ({ connectivityCredentialService: { listMetadata: services.listMetadata, read: services.read } }));
vi.mock('./DeploymentProfileService', () => ({ deploymentProfileService: { list: services.listProfiles } }));

type Session = { access_token: string; user: { id: string } } | null;
type AuthListener = (event: string, session: Session) => void;
const auth = vi.hoisted(() => ({ listener: null as AuthListener | null, session: null as Session }));
vi.mock('../auth/supabaseClient', () => ({
  getSupabaseClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: (listener: AuthListener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  }),
}));

const windowEvents = vi.hoisted(() => ({ online: [] as (() => void)[] }));
vi.stubGlobal('window', {
  addEventListener: (event: string, handler: () => void) => {
    if (event === 'online') windowEvents.online.push(handler);
  },
});

import { noteConnectivityAccountVerified, resetConnectivityBootstrap, useConnectivityBootstrap } from './useConnectivityBootstrap';
import { startAccountSessionSync } from '../auth/accountSessionSync';

const A = 'user-a';
const B = 'user-b';
const sessionOf = (userId: string, n = 1): Session => ({ access_token: `${userId}:${n}`, user: { id: userId } });
const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};
const renderDashboard = async (userId: string | null) => {
  useConnectivityBootstrap(userId ? { userId } : null);
  await flush();
};
const unmountDashboard = async () => {
  for (const cleanup of effects.cleanups.splice(0)) cleanup();
  await flush();
};
const goOnline = async () => {
  world.online = true;
  for (const handler of windowEvents.online) handler();
  await flush();
};
/** Accounts whose connectors were actually restored into the main process (a restore it accepted). */
const restoredAccounts = () =>
  mainIpc.connectivityRestore.mock.calls.filter((_call, i) => accepted[i]).map(([, scope]) => (scope as { userId: string }).userId);
/** Per restore call: whether the main process accepted it. */
let accepted: boolean[] = [];
const attempts = () => services.listMetadata.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectivityBootstrap();
  effects.cleanups.splice(0);
  windowEvents.online.splice(0);
  auth.listener = null;
  auth.session = null;
  accepted = [];
  Object.assign(world, { online: true, rejectTokens: new Set(), mainVerified: null, holdNextList: false, heldList: [], listsInFlight: 0, maxListsInFlight: 0 });

  services.listMetadata.mockImplementation(async () => {
    world.listsInFlight += 1;
    world.maxListsInFlight = Math.max(world.maxListsInFlight, world.listsInFlight);
    try {
      if (world.holdNextList) {
        world.holdNextList = false;
        await new Promise<void>((resolve) => world.heldList.push(resolve));
      }
      if (!world.online) throw new TypeError('Failed to fetch');
      return [{ connectorId: 'github', authMethod: 'oauth2', updatedAt: 1 }];
    } finally {
      world.listsInFlight -= 1;
    }
  });
  // The main process: verifies a token only while online; a rejected token verifies as no account.
  mainIpc.accountSetSession.mockImplementation(async (token: string | null) => {
    if (!token) world.mainVerified = null;
    else if (world.online) world.mainVerified = world.rejectTokens.has(token) ? null : userOf(token);
    else world.mainVerified = null; // offline: cannot verify, and no account was verified before
    return { signedIn: world.mainVerified !== null };
  });
  mainIpc.connectivityRestore.mockImplementation(async (_id: string, scope: { userId: string }) => {
    const ok = world.mainVerified === scope.userId;
    accepted.push(ok);
    return ok ? { ok: true, data: { state: 'connected', capabilities: [] } } : { ok: false, error: "connectivity:restore: that isn't the account signed in to PawOS." };
  });
});

async function startOffline(userId: string) {
  world.online = false;
  auth.session = sessionOf(userId);
  startAccountSessionSync();
  await flush();
  await renderDashboard(userId); // the Dashboard shows the remembered account while offline
}

describe('offline startup recovers connectors once the account is verified — event-driven, once', () => {
  it('offline startup, then reconnection: restores exactly once', async () => {
    await startOffline(A);
    expect(attempts()).toBe(1); // tried, could not reach Supabase
    expect(restoredAccounts()).toEqual([]);

    await goOnline();
    expect(restoredAccounts()).toEqual([A]);

    // Later sessions events and renders never restore again.
    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2));
    await flush();
    await renderDashboard(A);
    await goOnline();
    expect(restoredAccounts()).toEqual([A]);
    expect(attempts()).toBe(2);
  });

  it('repeated online events never run two restores at once, nor restore twice', async () => {
    await startOffline(A);
    world.holdNextList = true; // the retry's first request stays in flight…
    await goOnline();
    await goOnline(); // …while the network flaps and more online events arrive
    await goOnline();
    expect(world.maxListsInFlight).toBe(1);
    world.heldList.shift()!();
    await flush();
    expect(world.maxListsInFlight).toBe(1);
    expect(restoredAccounts()).toEqual([A]);
    expect(attempts()).toBe(2); // the startup attempt and one retry
  });

  it('a confirmation during a retry that then fails gets exactly one more try — then waits for the next event', async () => {
    await startOffline(A);
    world.holdNextList = true;
    await goOnline(); // the retry starts and is held
    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2)); // A confirmed again while it runs
    await flush();
    world.online = false; // …and the network drops before the held request answers
    world.heldList.shift()!();
    await flush();
    expect(attempts()).toBe(3); // startup, the retry, and exactly one more
    expect(world.maxListsInFlight).toBe(1);
    await renderDashboard(A);
    expect(attempts()).toBe(3); // no timer, no render-driven retry

    await goOnline();
    expect(restoredAccounts()).toEqual([A]);
    expect(attempts()).toBe(4);
  });

  it('main verification is delayed until after reconnection — no restore is accepted before it', async () => {
    await startOffline(A);
    expect(mainIpc.accountSetSession).toHaveBeenCalledTimes(1);
    expect(world.mainVerified).toBeNull();
    expect(mainIpc.connectivityRestore).not.toHaveBeenCalled();

    await goOnline();
    expect(mainIpc.accountSetSession).toHaveBeenCalledTimes(2); // the session was sent again on reconnection
    expect(mainIpc.accountSetSession.mock.invocationCallOrder[1]).toBeLessThan(services.listMetadata.mock.invocationCallOrder[1]);
    expect(accepted).toEqual([true]);
  });

  it('Supabase reachable but the main process not yet verified: the refused attempt waits for main to confirm the account', async () => {
    world.online = true;
    auth.session = sessionOf(A);
    mainIpc.accountSetSession.mockImplementationOnce(async () => ({ signedIn: false })); // verification still failing
    startAccountSessionSync();
    await flush();
    await renderDashboard(A);
    expect(accepted).toEqual([false]); // refused by main: pending, not done
    await renderDashboard(A);
    expect(attempts()).toBe(1); // renders never retry

    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2)); // main now verifies A
    await flush();
    expect(restoredAccounts()).toEqual([A]);
  });

  it('a failed verification never triggers a restore', async () => {
    await startOffline(A);
    world.rejectTokens.add(sessionOf(A)!.access_token); // the token turns out to be invalid
    await goOnline();
    await goOnline();
    expect(world.mainVerified).toBeNull();
    expect(attempts()).toBe(1);
    expect(mainIpc.connectivityRestore).not.toHaveBeenCalled();
  });

  it("switching accounts while offline restores only the newly verified account — never the previous one's", async () => {
    await startOffline(A);
    auth.listener!('SIGNED_OUT', null);
    await unmountDashboard();
    auth.session = sessionOf(B);
    auth.listener!('SIGNED_IN', sessionOf(B)); // still offline: main cannot verify B either
    await flush();
    await renderDashboard(B);
    expect(restoredAccounts()).toEqual([]);

    await goOnline();
    expect(restoredAccounts()).toEqual([B]);
    noteConnectivityAccountVerified(A); // a late confirmation for the previous account
    await flush();
    expect(restoredAccounts()).toEqual([B]);
    expect(services.listMetadata.mock.calls.filter(([scope]) => scope.userId === A)).toHaveLength(1); // only A's offline attempt
  });

  it("A → B with no signed-out step in between (the G4 path): B's confirmation never retries A's pending restore", async () => {
    await startOffline(A);
    world.online = true;
    auth.session = sessionOf(B);
    auth.listener!('SIGNED_IN', sessionOf(B)); // the window's session becomes B; the Dashboard still shows A
    await flush();
    expect(world.mainVerified).toBe(B);
    expect(services.listMetadata.mock.calls.map(([scope]) => scope.userId)).toEqual([A]); // only A's offline attempt
    await unmountDashboard();
    await renderDashboard(B); // the Dashboard moves to B: B's own session restores
    expect(restoredAccounts()).toEqual([B]);
    expect(services.listMetadata.mock.calls.map(([scope]) => scope.userId)).toEqual([A, B]);
  });

  it("sign-out cancels the previous account's pending restore", async () => {
    await startOffline(A);
    auth.listener!('SIGNED_OUT', null);
    await unmountDashboard();
    auth.session = null;
    await goOnline();
    noteConnectivityAccountVerified(A); // even a confirmation for A arriving now
    await flush();
    expect(attempts()).toBe(1);
    expect(mainIpc.connectivityRestore).not.toHaveBeenCalled();
  });

  it('sign-out during a running restore stops it before it reaches the main process', async () => {
    world.online = true;
    auth.session = sessionOf(A);
    startAccountSessionSync();
    await flush();
    world.holdNextList = true;
    await renderDashboard(A); // restore running, its first request in flight
    auth.listener!('SIGNED_OUT', null);
    await unmountDashboard();
    world.heldList.shift()!();
    await flush();
    expect(mainIpc.connectivityRestore).not.toHaveBeenCalled();
    expect(services.read).not.toHaveBeenCalled();
  });

  it('the same account signing out and back in while offline restores once for the new session', async () => {
    await startOffline(A);
    auth.listener!('SIGNED_OUT', null);
    await unmountDashboard();
    auth.listener!('SIGNED_IN', sessionOf(A, 2));
    await flush();
    await renderDashboard(A);
    await goOnline();
    await goOnline();
    expect(restoredAccounts()).toEqual([A]);
  });

  it('a momentary signed-out state while offline (session could not refresh) is recovered when the account is verified again', async () => {
    await startOffline(A);
    auth.listener!('TOKEN_REFRESHED', null); // the expired session could not refresh: sent as no session
    await flush();
    auth.session = null; // getSession has no usable session yet either
    await goOnline(); // getSession still has nothing: nothing is sent, nothing restored
    expect(restoredAccounts()).toEqual([]);
    auth.session = sessionOf(A, 2);
    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2)); // supabase-js refreshes once it can
    await flush();
    expect(restoredAccounts()).toEqual([A]);
  });

  it('a flaky reconnection (the session cannot refresh yet) is never sent as a sign-out', async () => {
    world.online = true;
    auth.session = sessionOf(A);
    startAccountSessionSync();
    await flush();
    await renderDashboard(A);
    expect(restoredAccounts()).toEqual([A]);
    auth.session = null; // getSession finds no usable session for a moment
    await goOnline();
    expect(mainIpc.accountSetSession).not.toHaveBeenCalledWith(null);
    expect(world.mainVerified).toBe(A);
    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2));
    await flush();
    expect(restoredAccounts()).toEqual([A]); // the session was never reset: nothing restores twice
  });

  it("a late confirmation for another account never starts the Dashboard's restore", async () => {
    await startOffline(B);
    auth.listener!('TOKEN_REFRESHED', null); // B's session momentarily could not refresh
    await flush();
    noteConnectivityAccountVerified(A); // a confirmation for A, arriving late
    await flush();
    expect(attempts()).toBe(1);
    noteConnectivityAccountVerified(B);
    await flush();
    expect(attempts()).toBe(2);
  });

  it('online startup is unchanged: restores at once, and nothing more on online events or token refreshes', async () => {
    world.online = true;
    auth.session = sessionOf(A);
    startAccountSessionSync();
    await flush();
    await renderDashboard(A);
    await goOnline();
    auth.listener!('TOKEN_REFRESHED', sessionOf(A, 2));
    await flush();
    expect(restoredAccounts()).toEqual([A]);
    expect(attempts()).toBe(1);
  });
});
