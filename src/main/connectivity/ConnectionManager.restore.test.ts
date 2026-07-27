import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectorStatus, ConnectivityScope, ConnectorConnection } from '../../shared/connectivity/ConnectivityTypes';

/**
 * Guards the exact regression this file exists to prevent: a page mount (or any repeated read)
 * calling something that ends up opening OAuth. `restore()` and `getConnectorStatus()` must only
 * ever reach `authenticate()`/`getStatus()` on the SDK — never `connect()`.
 */
function makeFakeSdk(id: string, connectFn: ReturnType<typeof vi.fn>, authenticateFn: ReturnType<typeof vi.fn>): ConnectorSDK {
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

describe('ConnectionManager.restore() / getConnectorStatus() — never trigger connect()', () => {
  const scope = { userId: 'u-restore-test' };
  const connectFn = vi.fn();
  const authenticateFn = vi.fn();

  beforeEach(() => {
    connectFn.mockClear();
    authenticateFn.mockClear();
    connectorRegistry.register(makeFakeSdk('fakeConnector', connectFn, authenticateFn));
  });

  afterEach(() => {
    connectorRegistry.unregister('fakeConnector');
  });

  it('restore() calls authenticate(), never connect()', async () => {
    const status = await connectionManager.restore('fakeConnector', scope, { token: 'abc' });
    expect(authenticateFn).toHaveBeenCalledWith({ token: 'abc' });
    expect(connectFn).not.toHaveBeenCalled();
    expect(status.state).toBe('connected');
  });

  it('getConnectorStatus() calls neither authenticate() nor connect() — pure read', async () => {
    await connectionManager.restore('fakeConnector', scope, { token: 'abc' });
    authenticateFn.mockClear();

    const status1 = await connectionManager.getConnectorStatus('fakeConnector', scope);
    const status2 = await connectionManager.getConnectorStatus('fakeConnector', scope);

    expect(authenticateFn).not.toHaveBeenCalled();
    expect(connectFn).not.toHaveBeenCalled();
    expect(status1.state).toBe('connected');
    expect(status2.state).toBe('connected');
  });

  it('getConnectorStatus() upserts the in-memory connection list so listConnections() reflects it', async () => {
    await connectionManager.restore('fakeConnector', scope, { token: 'abc' });
    await connectionManager.getConnectorStatus('fakeConnector', scope);

    const connections = await connectionManager.listConnections(scope);
    const entry = connections.find((c) => c.connectorId === 'fakeConnector');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('connected');
    expect(entry?.grantedPermissions).toEqual(['doThing']);
  });
});
