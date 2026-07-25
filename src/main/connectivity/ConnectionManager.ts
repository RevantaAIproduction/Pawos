import { connectorRegistry } from './ConnectorRegistry';
import type { ConnectorConnection, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

function scopeKey(scope: ConnectivityScope): string {
  return `${scope.userId}:${scope.organizationId ?? ''}`;
}

/**
 * Owns the lifecycle of a *connection instance* (per-user/org state), but
 * never does connector-specific work itself — every real action is looked
 * up in the Connector Registry and delegated to that connector's own
 * `ConnectorSDK`. This class only handles persistence/orchestration around
 * that call, exactly per the architecture's "the Runtime only talks through
 * the SDK" rule.
 *
 * Persistence note (a real, deliberate scope boundary, not an oversight):
 * the architecture calls for this to be backed by a `connectivity_connections`
 * Supabase table (Section 17's migration, not yet built) — and, per the
 * codebase's own established pattern (confirmed by an earlier audit: "no
 * main-process Supabase client exists anywhere," only the renderer holds a
 * Supabase session), the actual read/write to that table will happen from a
 * renderer-side `ConnectionManagerService.ts`, not from here directly. This
 * class's public API is already the final shape; only `persist()`/`load()`
 * below need to change from the in-memory Map to that renderer round-trip
 * once Section 17 lands — nothing above this file will need to change.
 */
class ConnectionManager {
  private connections = new Map<string, ConnectorConnection>();

  private connectionId(connectorId: string, scope: ConnectivityScope): string {
    return `${connectorId}::${scopeKey(scope)}`;
  }

  async connect(connectorId: string, scope: ConnectivityScope): Promise<ConnectorConnection> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot connect — no connector registered with id '${connectorId}'.`);
    }
    const connection = await sdk.connect(scope);
    this.connections.set(this.connectionId(connectorId, scope), connection);
    return connection;
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = this.findById(connectionId);
    if (!connection) return;
    const sdk = connectorRegistry.get(connection.connectorId);
    if (sdk) await sdk.disconnect(connection.scope);
    this.connections.delete(this.connectionId(connection.connectorId, connection.scope));
  }

  async getStatus(connectionId: string): Promise<ConnectorConnection | undefined> {
    return this.findById(connectionId);
  }

  async checkHealth(connectionId: string): Promise<ConnectorConnection> {
    const connection = this.findById(connectionId);
    if (!connection) {
      throw new Error(`Cannot check health — no connection found with id '${connectionId}'.`);
    }
    const sdk = connectorRegistry.get(connection.connectorId);
    if (!sdk) {
      throw new Error(`Cannot check health — connector '${connection.connectorId}' is no longer registered.`);
    }
    const result = await sdk.health(connection.scope);
    const updated: ConnectorConnection = { ...connection, healthStatus: result.status, lastHealthCheckAt: Date.now() };
    this.connections.set(this.connectionId(connection.connectorId, connection.scope), updated);
    return updated;
  }

  async listConnections(scope: ConnectivityScope): Promise<ConnectorConnection[]> {
    const key = scopeKey(scope);
    return [...this.connections.values()].filter((c) => scopeKey(c.scope) === key);
  }

  async recordSync(connectionId: string): Promise<void> {
    const connection = this.findById(connectionId);
    if (!connection) return;
    const updated: ConnectorConnection = { ...connection, lastSyncAt: Date.now() };
    this.connections.set(this.connectionId(connection.connectorId, connection.scope), updated);
  }

  private findById(connectionId: string): ConnectorConnection | undefined {
    return [...this.connections.values()].find((c) => c.id === connectionId);
  }
}

export const connectionManager = new ConnectionManager();
