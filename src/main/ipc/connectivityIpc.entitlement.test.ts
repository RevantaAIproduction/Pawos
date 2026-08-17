import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus } from '../../shared/connectivity/ConnectivityTypes';

/**
 * Exercises the REAL registered `ipcMain.handle()` callbacks for connectivityIpc.ts — not just the
 * pure predicate behind them (see ConnectorEntitlementGate.test.ts for that) — proving a caller that
 * invokes these IPC channels directly (bypassing ConnectionsPage.tsx's disabled button entirely)
 * still gets rejected before any real credential is created. Mirrors the exact
 * `vi.mock('electron', ...)` pattern already established in
 * DesktopExecutionEngine.runtimeAuthorization.test.ts for testing IPC-adjacent main-process code
 * without a real Electron binary.
 */
const handlers = new Map<string, (...args: any[]) => any>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn),
  },
}));

const fakeEvent = { sender: { isDestroyed: () => true } } as any;

function makeFakeSdk(id: string, connectFn: ReturnType<typeof vi.fn>): ConnectorSDK {
  let status: ConnectorStatus = { state: 'disconnected', capabilities: [] };
  return {
    definition: { id, displayName: id, category: 'other', authMethod: 'oauth2', capabilities: ['doThing'] },
    connect: async (scope: ConnectivityScope) => {
      connectFn(scope);
      status = { state: 'connected', capabilities: ['doThing'] };
      return { id: `${id}:${scope.userId}`, connectorId: id, scope, status: 'connected', grantedPermissions: ['doThing'], metadata: {} } as ConnectorConnection;
    },
    disconnect: async () => {
      status = { state: 'disconnected', capabilities: [] };
    },
    authenticate: async () => {
      status = { state: 'connected', capabilities: ['doThing'], connectedAt: new Date().toISOString() };
    },
    refresh: async () => {},
    validate: async () => ({ valid: true }),
    health: async () => ({ status: 'healthy' }),
    getStatus: async () => status,
    capabilities: () => status.capabilities,
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: async () => undefined,
  };
}

/**
 * Restore-path fake: an oauth2 connector whose authenticate() genuinely flips it into the
 * 'connected' state (mirroring every real ConnectorSDK's own authenticate() behavior) — so a test
 * can prove restore() either activated the connection for real, or left it exactly where it started
 * (`disconnected`, its initial state) because the entitlement gate rejected it before authenticate()
 * was ever reached.
 */
function makeFakeRestoreSdk(id: string, authenticateFn: ReturnType<typeof vi.fn>): ConnectorSDK {
  let status: ConnectorStatus = { state: 'disconnected', capabilities: [] };
  return {
    definition: { id, displayName: id, category: 'other', authMethod: 'oauth2', capabilities: ['doThing'] },
    connect: async () => {
      throw new Error('not used in this test');
    },
    disconnect: async () => {
      status = { state: 'disconnected', capabilities: [] };
    },
    authenticate: async (_scope, credential) => {
      authenticateFn(credential);
      status = { state: 'connected', capabilities: ['doThing'], connectedAt: new Date().toISOString() };
    },
    refresh: async () => {},
    validate: async () => ({ valid: true }),
    health: async () => ({ status: 'healthy' }),
    getStatus: async () => status,
    capabilities: () => status.capabilities,
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: async () => undefined,
  };
}

function makeFakeApiTokenSdk(id: string, authenticateFn: ReturnType<typeof vi.fn>): ConnectorSDK {
  return {
    definition: { id, displayName: id, category: 'other', authMethod: 'apiToken', capabilities: ['doThing'] },
    connect: async () => {
      throw new Error('not used in this test');
    },
    disconnect: async () => {},
    authenticate: async (_scope, credential) => {
      authenticateFn(credential);
    },
    refresh: async () => {},
    validate: async () => ({ valid: true }),
    health: async () => ({ status: 'healthy' }),
    getStatus: async () => ({ state: 'connected', capabilities: ['doThing'] }),
    capabilities: () => ['doThing'],
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: async () => undefined,
  };
}

describe('connectivityIpc — direct IPC invocation cannot bypass the connector entitlement gate', () => {
  let subscriptionStore: typeof import('../billing/SubscriptionStore').subscriptionStore;
  let connectorRegistry: typeof import('../connectivity/ConnectorRegistry').connectorRegistry;
  let credentialVaultBridge: typeof import('../connectivity/CredentialVaultBridge').credentialVaultBridge;

  beforeEach(async () => {
    vi.resetModules();
    handlers.clear();
    ({ subscriptionStore } = await import('../billing/SubscriptionStore'));
    ({ connectorRegistry } = await import('../connectivity/ConnectorRegistry'));
    ({ credentialVaultBridge } = await import('../connectivity/CredentialVaultBridge'));
    vi.spyOn(credentialVaultBridge, 'read').mockResolvedValue(undefined);
    vi.spyOn(credentialVaultBridge, 'store').mockResolvedValue(undefined);
    const { registerConnectivityIpc } = await import('./connectivityIpc');
    registerConnectivityIpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    connectorRegistry.unregister('jira');
    connectorRegistry.unregister('github');
    connectorRegistry.unregister('linear');
  });

  it('connectivity:connect — Pro is rejected for jira (Pro Max-only) before sdk.connect() ever runs', async () => {
    const connectFn = vi.fn();
    connectorRegistry.register(makeFakeSdk('jira', connectFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:connect')!(fakeEvent, 'jira', { userId: 'u1' });

    expect(result.ok).toBe(false);
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('connectivity:connect — Pro Max is allowed to connect jira, and sdk.connect() actually runs', async () => {
    const connectFn = vi.fn();
    connectorRegistry.register(makeFakeSdk('jira', connectFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });

    const result = await handlers.get('connectivity:connect')!(fakeEvent, 'jira', { userId: 'u1' });

    expect(result.ok).toBe(true);
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('connectivity:connect — Go is rejected for github (Pro-and-above) before sdk.connect() ever runs', async () => {
    const connectFn = vi.fn();
    connectorRegistry.register(makeFakeSdk('github', connectFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await handlers.get('connectivity:connect')!(fakeEvent, 'github', { userId: 'u1' });

    expect(result.ok).toBe(false);
    expect(connectFn).not.toHaveBeenCalled();
  });

  it('connectivity:connect — Pro is allowed to connect github', async () => {
    const connectFn = vi.fn();
    connectorRegistry.register(makeFakeSdk('github', connectFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:connect')!(fakeEvent, 'github', { userId: 'u1' });

    expect(result.ok).toBe(true);
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it('connectivity:apiTokens:save — Pro is rejected for jira, and no credential is ever authenticated/stored', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeApiTokenSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:apiTokens:save')!(fakeEvent, 'jira', { userId: 'u1' }, 'some-token');

    expect(result.ok).toBe(false);
    expect(authenticateFn).not.toHaveBeenCalled();
    expect(credentialVaultBridge.store).not.toHaveBeenCalled();
  });

  it('connectivity:apiTokens:save — Pro Max is allowed for jira, and the credential is actually saved', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeApiTokenSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });

    const result = await handlers.get('connectivity:apiTokens:save')!(fakeEvent, 'jira', { userId: 'u1' }, 'some-token');

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
    expect(credentialVaultBridge.store).toHaveBeenCalledTimes(1);
  });
});

/**
 * Downgrade-safety fix: connectivity:restore is the one place a credential that was legitimately
 * stored under a higher tier could otherwise silently reactivate into a live connection after the
 * account has since downgraded. Every scenario here calls the real registered `connectivity:restore`
 * handler directly (never through useConnectivityBootstrap or any renderer code), proving a caller
 * that bypasses the UI entirely still can't reactivate a connector the current tier doesn't permit —
 * and that a blocked restore never mutates or deletes the underlying stored credential.
 */
describe('connectivityIpc — connectivity:restore cannot reactivate a connector the current tier no longer permits', () => {
  let subscriptionStore: typeof import('../billing/SubscriptionStore').subscriptionStore;
  let connectorRegistry: typeof import('../connectivity/ConnectorRegistry').connectorRegistry;
  let credentialVaultBridge: typeof import('../connectivity/CredentialVaultBridge').credentialVaultBridge;

  beforeEach(async () => {
    vi.resetModules();
    handlers.clear();
    ({ subscriptionStore } = await import('../billing/SubscriptionStore'));
    ({ connectorRegistry } = await import('../connectivity/ConnectorRegistry'));
    ({ credentialVaultBridge } = await import('../connectivity/CredentialVaultBridge'));
    vi.spyOn(credentialVaultBridge, 'read').mockResolvedValue(undefined);
    vi.spyOn(credentialVaultBridge, 'store').mockResolvedValue(undefined);
    vi.spyOn(credentialVaultBridge, 'revoke').mockResolvedValue(undefined);
    const { registerConnectivityIpc } = await import('./connectivityIpc');
    registerConnectivityIpc();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    connectorRegistry.unregister('jira');
    connectorRegistry.unregister('github');
    connectorRegistry.unregister('linear');
  });

  const storedCredential = { accessToken: 'stored-access-token', refreshToken: 'stored-refresh-token' };

  it('1. Pro Max + stored Jira credential — restore allowed, connector actually activates', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
    expect(result.data.state).toBe('connected');
  });

  it('2. Pro + stored Jira credential (downgraded from Pro Max) — restore blocked, authenticate() never runs', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(false);
    expect(authenticateFn).not.toHaveBeenCalled();
  });

  it('3. Go + stored GitHub credential — restore blocked', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('github', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'github', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(false);
    expect(authenticateFn).not.toHaveBeenCalled();
  });

  it('4. Pro + stored GitHub credential — restore allowed', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('github', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'github', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
  });

  it('5. Pro Max + stored Linear credential — restore allowed', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('linear', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'linear', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
  });

  it('6. Pro + stored Linear credential (downgraded from Pro Max) — restore blocked', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('linear', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'linear', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(false);
    expect(authenticateFn).not.toHaveBeenCalled();
  });

  it('7. Team + an allowed connector (Jira) — restore allowed', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
  });

  it('8. Enterprise + an allowed connector (Jira) — restore allowed', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
  });

  it('9. A blocked connector never becomes an active connection through restore — getStatus stays disconnected', async () => {
    const authenticateFn = vi.fn();
    const sdk = makeFakeRestoreSdk('jira', authenticateFn);
    connectorRegistry.register(sdk);
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const restoreResult = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);
    expect(restoreResult.ok).toBe(false);

    // Independently ask the connector itself (not the rejected restore call) what state it's in —
    // it must still be the SDK's own initial 'disconnected' state, never 'connected'.
    const liveStatus = await sdk.getStatus({ userId: 'u1' });
    expect(liveStatus.state).toBe('disconnected');
  });

  it('10. A blocked restore never deletes or revokes the stored credential — it stays available for a later upgrade', async () => {
    const authenticateFn = vi.fn();
    connectorRegistry.register(makeFakeRestoreSdk('jira', authenticateFn));
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const result = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);

    expect(result.ok).toBe(false);
    expect(credentialVaultBridge.revoke).not.toHaveBeenCalled();
    expect(credentialVaultBridge.store).not.toHaveBeenCalled();

    // Upgrading and retrying the identical stored credential must now succeed — proving nothing
    // about the credential itself was consumed or invalidated by the earlier blocked attempt.
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    const retryResult = await handlers.get('connectivity:restore')!(fakeEvent, 'jira', { userId: 'u1' }, storedCredential);
    expect(retryResult.ok).toBe(true);
    expect(authenticateFn).toHaveBeenCalledTimes(1);
    expect(authenticateFn).toHaveBeenCalledWith(storedCredential);
  });
});
