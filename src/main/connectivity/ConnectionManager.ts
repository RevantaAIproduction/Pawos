import { connectorRegistry } from './ConnectorRegistry';
import type { ConnectorConnection, ConnectorStatus, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import { connectorLifecycleToConnectionStatus } from '../../shared/connectivity/ConnectivityTypes';

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

  async connect(connectorId: string, scope: ConnectivityScope, opts?: { incrementalCapabilities?: string[] }): Promise<ConnectorConnection> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot connect — no connector registered with id '${connectorId}'.`);
    }
    const connection = await sdk.connect(scope, opts);
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

  /**
   * Strictly read-only connector-level status discovery — the one method the Connections UI is
   * allowed to call on mount/repeated visits (see ConnectorSDK.getStatus's own contract). Delegates
   * straight to `sdk.getStatus()`, then mirrors the result into the in-memory connections map so
   * `listConnections()`/`getStatus(connectionId)` stay consistent with what was just read.
   */
  async getConnectorStatus(connectorId: string, scope: ConnectivityScope): Promise<ConnectorStatus> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot get status — no connector registered with id '${connectorId}'.`);
    }
    const status = await sdk.getStatus(scope);
    this.upsertFromStatus(connectorId, scope, status);
    return status;
  }

  /**
   * The one explicit restoration entry point — activates an already-obtained credential into a
   * connector's in-memory state via its existing `authenticate()` primitive. Never opens OAuth,
   * never mutates a stored credential (the credential itself was already read elsewhere — by the
   * renderer from Supabase for a signed-in user, or by main.ts's guest-mode startup code from the
   * local guest store). Intended to be called once per session (a one-time bootstrap), never from
   * a page-mount effect — see `useConnectivityBootstrap` on the renderer side.
   *
   * After authenticate() activates the credential, this also does one best-effort `sdk.refresh()`
   * call. This matters for OAuth connectors whose persisted-credential row doesn't carry every
   * live field the in-memory session normally would (e.g. `grantedScopes` isn't part of the
   * `connectivity_credentials` Supabase schema today) — refresh() re-derives that live state from
   * the provider itself using the already-restored refresh token, silently, with no browser
   * involved. A refresh failure is not fatal to the restore: authenticate() already succeeded, and
   * getStatus() below reports whatever state refresh() left behind (including `expired`/
   * `requiresReauth` if the refresh token itself was rejected).
   */
  async restore(connectorId: string, scope: ConnectivityScope, credential: unknown): Promise<ConnectorStatus> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot restore — no connector registered with id '${connectorId}'.`);
    }
    await sdk.authenticate(scope, credential);
    await sdk.refresh(scope).catch(() => {});
    const status = await sdk.getStatus(scope);
    this.upsertFromStatus(connectorId, scope, status);
    return status;
  }

  private upsertFromStatus(connectorId: string, scope: ConnectivityScope, status: ConnectorStatus): ConnectorConnection {
    const key = this.connectionId(connectorId, scope);
    const existing = this.connections.get(key);
    const updated: ConnectorConnection = {
      id: existing?.id ?? `${connectorId}:${scope.userId}`,
      connectorId,
      scope,
      status: connectorLifecycleToConnectionStatus(status.state),
      grantedPermissions: status.capabilities,
      lastSyncAt: status.lastSyncAt ? Date.parse(status.lastSyncAt) : existing?.lastSyncAt,
      lastHealthCheckAt: existing?.lastHealthCheckAt,
      healthStatus: existing?.healthStatus,
      metadata: existing?.metadata ?? {},
    };
    this.connections.set(key, updated);
    return updated;
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
