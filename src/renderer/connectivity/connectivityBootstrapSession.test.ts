import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// No DOM renderer here: React's useEffect runs its effect straight away, so the real hook body runs
// on every "render" exactly as React would run it when its dependencies change.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (effect: () => void) => {
    effect();
  },
}));

// The restore itself talks to Supabase and the main process; these tests are about WHEN it runs.
const restore = vi.hoisted(() => ({
  listMetadata: vi.fn(async (_scope: { userId: string }) => [] as unknown[]),
  listConnections: vi.fn(async () => [] as unknown[]),
  listProfiles: vi.fn(async () => [] as unknown[]),
}));
vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: { accountSetSession: vi.fn(async () => ({ signedIn: true })) } }));
vi.mock('./ConnectionManagerService', () => ({ connectionManagerService: { list: restore.listConnections } }));
vi.mock('./ConnectivityCredentialService', () => ({ connectivityCredentialService: { listMetadata: restore.listMetadata } }));
vi.mock('./DeploymentProfileService', () => ({ deploymentProfileService: { list: restore.listProfiles } }));
type AuthListener = (event: string, session: { access_token: string } | null) => void;
const auth = vi.hoisted(() => ({ listener: null as AuthListener | null, session: null as { access_token: string } | null }));
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

import { claimConnectivityBootstrap, resetConnectivityBootstrap, useConnectivityBootstrap } from './useConnectivityBootstrap';
import { startAccountSessionSync } from '../auth/accountSessionSync';

/**
 * Connector restore runs once per signed-in session, from the signed-in Dashboard shell: at startup,
 * after an account switch (A → B, and back to A), and after sign-out → sign-in — even as the same
 * account, without restarting PawOS — because the main process forgets every connector credential
 * when the account changes. Never for a signed-out session; never twice for repeated renders.
 */

const A = { userId: 'user-a' };
const B = { userId: 'user-b' };
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};
/** One render of the signed-in Dashboard shell for `scope` (null = no signed-in account). */
const renderDashboard = async (scope: { userId: string } | null) => {
  useConnectivityBootstrap(scope);
  await flush();
};
const restoredFor = () => restore.listMetadata.mock.calls.map(([scope]) => scope.userId);

beforeEach(() => {
  resetConnectivityBootstrap();
  restore.listMetadata.mockClear();
});

describe('when connector restore runs', () => {
  it('initial signed-in startup: restores once, for that account', async () => {
    await renderDashboard(A);
    expect(restoredFor()).toEqual(['user-a']);
  });

  it('signed-out startup: nothing is restored — and the first sign-in then restores', async () => {
    await renderDashboard(null);
    await renderDashboard(null);
    expect(restoredFor()).toEqual([]);
    await renderDashboard(A);
    expect(restoredFor()).toEqual(['user-a']);
  });

  it('repeated Dashboard renders (and section changes) never restore twice', async () => {
    for (let render = 0; render < 5; render += 1) await renderDashboard(A);
    expect(restoredFor()).toEqual(['user-a']);
  });

  it('switching accounts restores for the new account, and again when switching back', async () => {
    await renderDashboard(A);
    await renderDashboard(B);
    await renderDashboard(A);
    expect(restoredFor()).toEqual(['user-a', 'user-b', 'user-a']);
  });

  it('an organization scope of the same account is its own session', () => {
    expect(claimConnectivityBootstrap(A)).toBe(true);
    expect(claimConnectivityBootstrap({ ...A, organizationId: 'org-1' })).toBe(true);
  });

  it('sign-out then sign-in with the same account restores again (session sync resets on sign-out only)', async () => {
    auth.session = { access_token: 'token-a' };
    startAccountSessionSync();
    await flush();
    expect(auth.listener).not.toBeNull();

    await renderDashboard(A);
    auth.listener!('TOKEN_REFRESHED', { access_token: 'token-a-2' });
    await renderDashboard(A); // same session: no second restore
    expect(restoredFor()).toEqual(['user-a']);

    auth.listener!('SIGNED_OUT', null);
    await renderDashboard(A); // signed back in as A, same app run
    expect(restoredFor()).toEqual(['user-a', 'user-a']);

    auth.listener!('SIGNED_IN', { access_token: 'token-a-3' });
    await renderDashboard(A);
    expect(restoredFor()).toEqual(['user-a', 'user-a']);
  });
});

describe('where it is mounted', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

  it('the signed-in Dashboard shell runs it once, at its top level, for the signed-in account', () => {
    const dashboard = read('../ui/Dashboard/Dashboard.tsx');
    const calls = dashboard.match(/useConnectivityBootstrap\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(dashboard).toMatch(/useConnectivityBootstrap\(user \? \{ userId: user\.id \} : null\);/);
  });

  it('Settings no longer runs it (so restore no longer waits for Settings to be opened)', () => {
    expect(read('../ui/Dashboard/sections/SettingsSection.tsx')).not.toMatch(/useConnectivityBootstrap\(/);
  });
});
