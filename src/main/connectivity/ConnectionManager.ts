import type { WebContents } from 'electron';
import { connectorRegistry } from './ConnectorRegistry';
import type { ConnectorConnection, ConnectorStatus, ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';
import { connectorLifecycleToConnectionStatus } from '../../shared/connectivity/ConnectivityTypes';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { persistCredentialViaRenderer, revokeCredentialViaRenderer } from './RendererConnectivityCredentialBridge';
import { probeConnectorMcp } from './mcp/ConnectorMcpServers';
import { isMcpCredentialId, mcpCredentialId } from '../../shared/connectivity/McpProviders';

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
  /** The app window that last connected or restored a credential — the only route to the durable
   *  store (see RendererConnectivityCredentialBridge), reused when a refreshed token needs persisting. */
  private credentialPersistSender: WebContents | undefined;

  private connectionId(connectorId: string, scope: ConnectivityScope): string {
    return `${connectorId}::${scopeKey(scope)}`;
  }

  /**
   * P0-4 security fix. `sdk.connect()` already stores the fresh credential into
   * `credentialVaultBridge` (in-memory, this process's lifetime only — see that file's own doc
   * comment). Previously nothing after that point ever reached Supabase Vault, so every one of the
   * 9 registered OAuth connectors lost its connection on every app restart. When `sender` is
   * supplied (the real IPC caller, threaded through from connectivityIpc.ts), this now also asks
   * that renderer window to durably persist the credential via `connectivityCredentialService.store()`
   * — best-effort with respect to the connection itself (a persistence failure doesn't undo a
   * successful `sdk.connect()`, since the connector is genuinely usable for this session either way),
   * but never silently swallowed: failures are logged so a real persistence outage is visible.
   */
  async connect(
    connectorId: string,
    scope: ConnectivityScope,
    opts?: { incrementalCapabilities?: string[] },
    sender?: WebContents
  ): Promise<ConnectorConnection> {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot connect — no connector registered with id '${connectorId}'.`);
    }
    if (sender) this.credentialPersistSender = sender;
    const connection = await sdk.connect(scope, opts);
    this.connections.set(this.connectionId(connectorId, scope), connection);

    if (sender && !sender.isDestroyed()) {
      await this.persistStoredCredential(connectorId, scope);
    }

    // Once per session: does this connector's official MCP server accept the token? (initialize +
    // tools/list only — see probeConnectorMcp). Never blocks or fails the connection.
    void credentialVaultBridge
      .read(connectorId, scope)
      .then((stored) => probeConnectorMcp(connectorId, stored?.secret))
      .catch(() => {});

    return connection;
  }

  /**
   * Writes whatever the Credential Vault currently holds for this connector back to the durable
   * store (Supabase Vault, through the renderer — the same round trip connect() uses). A connector
   * calls this after a token refresh so a new access token, expiry and rotated refresh token
   * survive an app restart. Best-effort and never throws: the in-memory connection keeps working
   * either way, and a failure is logged (message only — never the credential).
   */
  async persistStoredCredential(connectorId: string, scope: ConnectivityScope): Promise<boolean> {
    const sender = this.credentialPersistSender;
    if (!sender || sender.isDestroyed()) {
      console.error(`[ConnectionManager] No app window available to durably persist the credential for '${connectorId}'.`);
      return false;
    }
    const stored = await credentialVaultBridge.read(connectorId, scope);
    if (!stored) return false;
    const result = await persistCredentialViaRenderer(sender, scope, connectorId, stored.authMethod, stored.secret, {
      refreshToken: stored.refreshToken,
      expiresAt: stored.expiresAt,
    });
    if (!result.ok) {
      console.error(`[ConnectionManager] Failed to durably persist credential for '${connectorId}': ${result.message}`);
    }
    return result.ok;
  }

  async disconnect(connectionId: string, sender?: WebContents): Promise<void> {
    const connection = this.findById(connectionId);
    if (!connection) return;
    const sdk = connectorRegistry.get(connection.connectorId);
    if (sdk) await sdk.disconnect(connection.scope);
    this.connections.delete(this.connectionId(connection.connectorId, connection.scope));
    if (sender && !sender.isDestroyed()) {
      const result = await revokeCredentialViaRenderer(sender, connection.scope, connection.connectorId);
      if (!result.ok) {
        console.error(`[ConnectionManager] Failed to revoke persisted credential for '${connection.connectorId}': ${result.message}`);
      }
    }
    // A connector's separate MCP sign-in does not outlive the connector.
    const mcpId = mcpCredentialId(connection.connectorId);
    if (await credentialVaultBridge.read(mcpId, connection.scope)) {
      await credentialVaultBridge.revoke(mcpId, connection.scope);
      if (sender) this.credentialPersistSender = sender;
      await this.revokeStoredCredential(mcpId, connection.scope);
    }
  }

  /** Records the app window that can reach the durable store, for flows that persist outside connect()/restore(). */
  rememberCredentialPersistSender(sender: WebContents): void {
    this.credentialPersistSender = sender;
  }

  /** Removes a credential from the durable store (the counterpart of persistStoredCredential). Best-effort, never throws. */
  async revokeStoredCredential(connectorId: string, scope: ConnectivityScope): Promise<boolean> {
    const sender = this.credentialPersistSender;
    if (!sender || sender.isDestroyed()) return false;
    const result = await revokeCredentialViaRenderer(sender, scope, connectorId);
    if (!result.ok) console.error(`[ConnectionManager] Failed to revoke persisted credential for '${connectorId}': ${result.message}`);
    return result.ok;
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
  async restore(connectorId: string, scope: ConnectivityScope, credential: unknown, sender?: WebContents): Promise<ConnectorStatus> {
    if (isMcpCredentialId(connectorId)) {
      // A connector's separate MCP sign-in: not a connector of its own, so there is no SDK to
      // authenticate — the credential just goes back into the vault for the MCP gateway to use.
      if (sender) this.credentialPersistSender = sender;
      const c = credential as { accessToken?: unknown; refreshToken?: unknown; expiresAt?: unknown } | null | undefined;
      if (!c || typeof c.accessToken !== 'string') throw new Error('MCP credential must include accessToken.');
      await credentialVaultBridge.store(connectorId, scope, c.accessToken, 'oauth2', {
        refreshToken: typeof c.refreshToken === 'string' ? c.refreshToken : undefined,
        expiresAt: typeof c.expiresAt === 'number' ? c.expiresAt : undefined,
      });
      return { state: 'connected', capabilities: [] };
    }
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot restore — no connector registered with id '${connectorId}'.`);
    }
    // The window that restored this credential is the one that can persist a refreshed copy of it.
    if (sender) this.credentialPersistSender = sender;
    await sdk.authenticate(scope, credential);
    await sdk.refresh(scope).catch(() => {});
    const status = await sdk.getStatus(scope);
    if (status.state === 'connected') {
      // Prefer the vault copy (a connector that just refreshed has rotated it); fall back to what was restored.
      const restored = (credential as { accessToken?: unknown } | null | undefined)?.accessToken;
      void credentialVaultBridge
        .read(connectorId, scope)
        .then((stored) => probeConnectorMcp(connectorId, stored?.secret ?? (typeof restored === 'string' ? restored : undefined)))
        .catch(() => {});
    }
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
