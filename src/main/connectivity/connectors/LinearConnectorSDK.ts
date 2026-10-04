import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { LinearConnector } from '../../infrastructure/connectors/projectManagement/LinearConnector';
import { LinearMcpReadTransport } from '../../infrastructure/connectors/projectManagement/LinearMcpReadTransport';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { connectionManager } from '../ConnectionManager';

interface LinearCredential {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. Absent only for a connection made before Linear access tokens carried an expiry. */
  expiresAt?: number;
  name?: string;
  organizationName?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ name?: string; organizationName?: string }> {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ viewer { name } organization { name } }' }),
  });
  if (!res.ok) throw new Error(`Linear rejected the new access token (HTTP ${res.status}).`);
  const json = (await res.json()) as { data?: { viewer?: { name?: string }; organization?: { name?: string } } };
  return { name: json.data?.viewer?.name, organizationName: json.data?.organization?.name };
}

/** Refresh this long before the access token's stated expiry, so a request never starts with a
 *  token that lapses mid-flight. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Team-plan connector — gated by FeatureId 'connectLinear' (see EntitlementService.ts). Wraps the
 * existing LinearConnector GraphQL class and owns the OAuth token lifecycle for it: Linear access
 * tokens expire (about 24 hours) and come with a refresh token, so this keeps access token, refresh
 * token and expiry together, refreshes through OAuthManager.refreshAndPersist before the token
 * lapses (or when Linear rejects it), and writes every refreshed credential back through the
 * Credential Vault and the durable store so the connection survives an app restart.
 */
export class LinearConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'linear',
    displayName: 'Linear',
    description: 'Read issues and projects from your Linear workspace.',
    category: 'projectManagement' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      // write: Autonomous Work comments on the issue and updates its status (LinearWriteBackPlugin).
      // Tokens granted before this was added need a reconnect.
      scopes: ['read', 'write'],
      scopeSeparator: ',' as const,
      clientIdEnvVar: 'LINEAR_CLIENT_ID',
      clientSecretEnvVar: 'LINEAR_CLIENT_SECRET',
      redirectUriEnvVar: 'LINEAR_REDIRECT_URL',
    },
    capabilities: ['readIssues'],
    capabilityDescriptors: [{ id: 'readIssues', label: 'Read issues', description: 'Fetch or search Linear issues and projects.' }],
  };

  private credential: LinearCredential | undefined;
  /** The scope the live credential belongs to — needed to refresh from a ticket read, which carries no scope. */
  private scope: ConnectivityScope | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };
  /** Single-flight: Linear rotates refresh tokens, so two overlapping refreshes would invalidate each other. */
  private refreshInFlight: Promise<void> | undefined;
  /** Read-only Remote MCP transport, shared across re-registrations so its session survives a token refresh. */
  private readonly mcp = new LinearMcpReadTransport();

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register(
      'projectManagement',
      new LinearConnector(this.credential?.accessToken, {
        getAccessToken: (opts) => this.getFreshAccessToken(opts),
        // LINEAR_MCP_DISABLED=1 turns the MCP read path off entirely (GraphQL only).
        mcp: process.env.LINEAR_MCP_DISABLED === '1' ? undefined : this.mcp,
      })
    );
  }

  private isExpiring(credential: LinearCredential): boolean {
    return credential.expiresAt !== undefined && credential.expiresAt - Date.now() <= REFRESH_SKEW_MS;
  }

  /**
   * The current access token, refreshed first when it is expired/expiring or when the caller says
   * Linear just rejected it (`forceRefresh`). Returns the existing token when no refresh is possible
   * (no refresh token stored) or the refresh fails — the caller's request then fails honestly and
   * getStatus() reports why. Used by LinearConnector for every GraphQL/MCP read and by the
   * stored-credential IPC that autonomous write-back resolves its token through.
   */
  async getFreshAccessToken(opts?: { forceRefresh?: boolean }): Promise<string | undefined> {
    const credential = this.credential;
    if (!credential) return undefined;
    if (!opts?.forceRefresh && !this.isExpiring(credential)) return credential.accessToken;
    if (!credential.refreshToken || !this.scope) return credential.accessToken;
    await this.refreshNow(this.scope).catch(() => {});
    return this.credential?.accessToken;
  }

  private refreshNow(scope: ConnectivityScope): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh(scope).finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(scope: ConnectivityScope): Promise<void> {
    try {
      // refreshAndPersist rotates the vault entry and keeps the old refresh token if Linear didn't send a new one.
      const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
      if (!this.credential) return; // disconnected while the refresh was in flight
      this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.organizationName };
      // Durable copy: without this a rotated refresh token would be lost on restart.
      await connectionManager.persistStoredCredential(this.definition.id, scope);
    } catch (error) {
      // A network failure says nothing about the grant — only a real rejection asks the user to reconnect.
      const offline = error instanceof TypeError;
      this.currentStatus = {
        state: offline ? 'expired' : 'requiresReauth',
        capabilities: [],
        lastError: offline ? 'Could not reach Linear to refresh access.' : error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<LinearCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Linear credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, name: c.name, organizationName: c.organizationName };
    this.scope = _scope;
    // After an app restart the in-memory vault is empty; re-seed it from the restored credential so
    // refreshAndPersist (and the write-back credential lookup) have the refresh token and expiry.
    await credentialVaultBridge.store(this.definition.id, _scope, c.accessToken, 'oauth2', { refreshToken: c.refreshToken, expiresAt: c.expiresAt });
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.organizationName };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
      const identity = await fetchIdentity(token.accessToken);
      this.credential = { accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt, ...identity };
      this.scope = scope;
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', {
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        grantedScopes: token.grantedScopes,
      });
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.organizationName };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `linear:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.name, organization: this.credential?.organizationName },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    this.scope = undefined;
    this.mcp.reset();
    await credentialVaultBridge.revoke(this.definition.id, scope);
    infrastructureConnectorRegistry.register('projectManagement', new LinearConnector(undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  /**
   * Refreshes only when needed: the stored expiry has (nearly) passed, or Linear rejects the token.
   * A credential with no refresh token (connected before Linear issued them) can't be refreshed —
   * once Linear rejects it the only way forward is to reconnect.
   */
  async refresh(scope: ConnectivityScope): Promise<void> {
    const credential = this.credential;
    if (!credential) return;
    this.scope = scope;
    if (!this.isExpiring(credential)) {
      try {
        await fetchIdentity(credential.accessToken);
        return;
      } catch (error) {
        if (!credential.refreshToken) {
          this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
          return;
        }
      }
    }
    if (!credential.refreshToken) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: 'Linear access has expired. Reconnect Linear to continue.' };
      return;
    }
    await this.refreshNow(scope).catch(() => {});
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Linear is not connected.' };
    try {
      await fetchIdentity((await this.getFreshAccessToken()) ?? this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.organizationName } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(): Promise<unknown> {
    throw new Error('LinearConnectorSDK.execute: use the existing infrastructureConnectorRegistry projectManagement connector directly.');
  }
}

export const linearConnectorSDK = new LinearConnectorSDK();
