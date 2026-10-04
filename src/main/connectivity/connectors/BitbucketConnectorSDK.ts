import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { BitbucketSourceControlConnector } from '../../infrastructure/connectors/sourceControl/BitbucketSourceControlConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { connectionManager } from '../ConnectionManager';

interface BitbucketCredential {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. Bitbucket access tokens last about two hours. */
  expiresAt?: number;
  username?: string;
  displayName?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ username?: string; displayName?: string }> {
  const res = await fetch('https://api.bitbucket.org/2.0/user', { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Bitbucket rejected the access token (HTTP ${res.status}).`);
  const user = (await res.json()) as { username?: string; nickname?: string; display_name?: string };
  return { username: user.username ?? user.nickname, displayName: user.display_name };
}

/** Refresh this long before the access token's stated expiry. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Bitbucket Cloud — OAuth 2.0 authorization-code connector, gated by FeatureId 'connectBitbucket'.
 * Same architecture as every other OAuth connector here: OAuthManager drives the consent, the
 * hosted callback (pawos-web /api/connectors/bitbucket/oauth/callback) relays the code back, the
 * exchange and every refresh go through pawos-web's /api/connectivity/oauth/exchange (the only
 * place the consumer secret lives), and tokens are kept in the Credential Vault.
 *
 * Token lifecycle follows LinearConnectorSDK: access token, refresh token and expiry are stored
 * together, refreshed shortly before expiry or when Bitbucket rejects the token, and every refresh
 * is written back to the durable store. authenticate() deliberately needs nothing but the tokens,
 * so a connection made from PawOS Web (which stores only tokens) activates here on the next restore.
 */
export class BitbucketConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'bitbucket',
    displayName: 'Bitbucket Cloud',
    description: 'Read repositories and pull requests from your Bitbucket Cloud workspaces.',
    category: 'sourceControl' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://bitbucket.org/site/oauth2/authorize',
      tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
      // Must be enabled on the Bitbucket OAuth consumer. pullrequest:write covers reading
      // repositories and pull requests and posting the AI review comment.
      scopes: ['account', 'repository', 'pullrequest:write'],
      clientIdEnvVar: 'CONNECTOR_BITBUCKET_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_BITBUCKET_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_BITBUCKET_CALLBACK_URL',
    },
    capabilities: ['readRepositories', 'readPullRequests'],
    capabilityDescriptors: [
      { id: 'readRepositories', label: 'Read repositories', description: 'List and read your Bitbucket repositories.' },
      { id: 'readPullRequests', label: 'Read pull requests', description: 'List and read pull requests, including AI PR review.' },
    ],
  };

  private credential: BitbucketCredential | undefined;
  private scope: ConnectivityScope | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };
  /** Single-flight: Bitbucket rotates refresh tokens, so overlapping refreshes would invalidate each other. */
  private refreshInFlight: Promise<void> | undefined;

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register(
      'sourceControl',
      new BitbucketSourceControlConnector(this.credential?.accessToken, { getAccessToken: (opts) => this.getFreshAccessToken(opts) })
    );
  }

  private isExpiring(credential: BitbucketCredential): boolean {
    return credential.expiresAt !== undefined && credential.expiresAt - Date.now() <= REFRESH_SKEW_MS;
  }

  private label(): string | undefined {
    return this.credential?.displayName ?? this.credential?.username;
  }

  /** The current access token, refreshed first when it is expiring or Bitbucket just rejected it. */
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
      const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
      if (!this.credential) return; // disconnected while the refresh was in flight
      this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.label() };
      // Durable copy: without this a rotated refresh token would be lost on restart.
      await connectionManager.persistStoredCredential(this.definition.id, scope);
    } catch (error) {
      const offline = error instanceof TypeError;
      this.currentStatus = {
        state: offline ? 'expired' : 'requiresReauth',
        capabilities: [],
        lastError: offline ? 'Could not reach Bitbucket to refresh access.' : error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
  }

  async authenticate(scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<BitbucketCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Bitbucket credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, username: c.username, displayName: c.displayName };
    this.scope = scope;
    // After an app restart the in-memory vault is empty; re-seed it so refreshAndPersist has the refresh token.
    await credentialVaultBridge.store(this.definition.id, scope, c.accessToken, 'oauth2', { refreshToken: c.refreshToken, expiresAt: c.expiresAt });
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: this.label() };
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
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: this.label() };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `bitbucket:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.label(), username: this.credential?.username },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    this.scope = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    infrastructureConnectorRegistry.register('sourceControl', new BitbucketSourceControlConnector(undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  /**
   * Refreshes when the stored expiry has (nearly) passed or Bitbucket rejects the token; otherwise
   * just confirms the token works and fills in the account name (a credential restored from the
   * durable store, or connected from PawOS Web, arrives without one).
   */
  async refresh(scope: ConnectivityScope): Promise<void> {
    const credential = this.credential;
    if (!credential) return;
    this.scope = scope;
    if (!this.isExpiring(credential)) {
      try {
        const identity = await fetchIdentity(credential.accessToken);
        this.credential = { ...credential, ...identity };
        this.currentStatus = { ...this.currentStatus, detail: this.label() };
        return;
      } catch (error) {
        if (!credential.refreshToken) {
          this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
          return;
        }
      }
    }
    if (!credential.refreshToken) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: 'Bitbucket access has expired. Reconnect Bitbucket to continue.' };
      return;
    }
    await this.refreshNow(scope).catch(() => {});
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Bitbucket is not connected.' };
    try {
      await fetchIdentity((await this.getFreshAccessToken()) ?? this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.label() } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(): Promise<unknown> {
    throw new Error('BitbucketConnectorSDK.execute: use the existing infrastructureConnectorRegistry sourceControl connector directly.');
  }
}

export const bitbucketConnectorSDK = new BitbucketConnectorSDK();
