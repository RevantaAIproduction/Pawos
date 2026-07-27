import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import { capabilityRequirementResolver } from './CapabilityRequirementResolver';
import type { ConnectorSDK } from '../../shared/connectivity/ConnectorSDK';
import type { ConnectorConnection } from '../../shared/connectivity/ConnectivityTypes';
import type { ActionResult } from '../../shared/actions/ActionTypes';

const CONNECTOR_ID = 'fake-productivity-connector';

function capabilitiesOf(blockingResult: ActionResult | undefined) {
  return blockingResult && !blockingResult.ok ? blockingResult.confirmation?.capabilities : undefined;
}

function fakeProductivityConnector(liveCapabilities: string[]): ConnectorSDK {
  return {
    definition: {
      id: CONNECTOR_ID,
      displayName: 'Fake Productivity Connector',
      category: 'productivity',
      authMethod: 'oauth2',
      capabilities: ['capA', 'capB'],
    },
    async connect(scope): Promise<ConnectorConnection> {
      return {
        id: `${CONNECTOR_ID}:${scope.userId}`,
        connectorId: CONNECTOR_ID,
        scope,
        status: 'connected',
        grantedPermissions: liveCapabilities,
        metadata: {},
      };
    },
    disconnect: vi.fn(),
    authenticate: vi.fn(),
    refresh: vi.fn(),
    validate: vi.fn(),
    health: async () => ({ status: 'healthy' as const }),
    getStatus: async () => ({ state: liveCapabilities.length ? ('connected' as const) : ('disconnected' as const), capabilities: liveCapabilities }),
    capabilities: () => liveCapabilities,
    subscribe: () => () => {},
    unsubscribe: () => {},
    execute: vi.fn(),
  };
}

describe('CapabilityRequirementResolver — productivity fallback + incremental grantMode', () => {
  const scope = { userId: 'u1' };

  afterEach(() => {
    connectorRegistry.unregister(CONNECTOR_ID);
  });

  it('reports "connect" (not connected at all) when no connector is registered for the category', async () => {
    const resolution = await capabilityRequirementResolver.resolve({ kind: 'capability', category: 'productivity' }, { scope });
    expect(resolution.satisfied).toBe(false);
    const confirmation = capabilitiesOf(resolution.blockingResult)?.[0];
    expect(confirmation?.candidateProviders).toEqual([]);
  });

  it('is satisfied at the category level once a connector for that category is connected', async () => {
    connectorRegistry.register(fakeProductivityConnector(['capA']));
    await connectionManager.connect(CONNECTOR_ID, scope);

    const resolution = await capabilityRequirementResolver.resolve({ kind: 'capability', category: 'productivity' }, { scope });
    expect(resolution.satisfied).toBe(true);
  });

  it('is satisfied when the specific requested capability is live on the connected connector', async () => {
    connectorRegistry.register(fakeProductivityConnector(['capA']));
    await connectionManager.connect(CONNECTOR_ID, scope);

    const resolution = await capabilityRequirementResolver.resolve({ kind: 'capability', category: 'productivity', capability: 'capA' }, { scope });
    expect(resolution.satisfied).toBe(true);
  });

  it('resolves as an incremental-scope grant (not a full reconnect) when connected but missing one capability', async () => {
    connectorRegistry.register(fakeProductivityConnector(['capA'])); // capB not yet granted
    await connectionManager.connect(CONNECTOR_ID, scope);

    const resolution = await capabilityRequirementResolver.resolve({ kind: 'capability', category: 'productivity', capability: 'capB' }, { scope });
    expect(resolution.satisfied).toBe(false);
    const candidate = capabilitiesOf(resolution.blockingResult)?.[0]?.candidateProviders?.[0];
    expect(candidate?.grantMode).toBe('incrementalScope');
    expect(candidate?.missingCapability).toBe('capB');
    expect(candidate?.connectorId).toBe(CONNECTOR_ID);
  });
});
