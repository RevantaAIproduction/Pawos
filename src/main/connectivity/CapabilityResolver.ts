import { connectorRegistry } from './ConnectorRegistry';
import { connectionManager } from './ConnectionManager';
import type { ConnectorDefinition, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

/**
 * The piece that keeps reasoning provider-agnostic: the Planning Runtime and
 * Autonomous Engineering Runtime ask for a capability ("readTickets",
 * "createPullRequest"), never a connector name. Resolves purely through
 * `ConnectorSDK` instances already registered in the Connector Registry —
 * never references GitHub/Jira/GitLab/Linear/etc. by name anywhere in this
 * file, and never duplicates connection-state tracking (all of that is
 * `ConnectionManager`'s job; this only reads from it).
 */
class CapabilityResolver {
  /** Every registered connector that declares this capability, connected or
   *  not — reads the static declaration, since this answers "what could I
   *  use" rather than "what can I use right now." */
  listCapableConnectors(capability: string): ConnectorDefinition[] {
    return connectorRegistry
      .list()
      .filter((sdk) => sdk.definition.capabilities.includes(capability))
      .map((sdk) => sdk.definition);
  }

  /** Only connectors the given scope has an actually-connected, currently
   *  healthy connection for, that still expose this capability via a live
   *  `capabilities()` call (not just the static declaration — a connector
   *  can report a narrower live set than it declared, e.g. a reduced OAuth
   *  grant). Health is re-checked here rather than trusting a possibly
   *  stale/never-set cached value, for the same reason capabilities() is
   *  queried live rather than from the static array: "available right now"
   *  should reflect current reality, not a snapshot from whenever this
   *  connection last happened to be checked. */
  async listAvailableConnectors(capability: string, scope: ConnectivityScope): Promise<ConnectorDefinition[]> {
    const connections = await connectionManager.listConnections(scope);
    const results: ConnectorDefinition[] = [];

    for (const connection of connections) {
      if (connection.status !== 'connected') continue;

      const sdk = connectorRegistry.get(connection.connectorId);
      if (!sdk) continue;

      const fresh = await connectionManager.checkHealth(connection.id);
      if (fresh.healthStatus !== 'healthy') continue;

      if (!sdk.capabilities().includes(capability)) continue;

      results.push(sdk.definition);
    }

    return results;
  }
}

export const capabilityResolver = new CapabilityResolver();
