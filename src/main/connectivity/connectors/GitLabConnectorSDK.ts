import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import { AccountBound, assertCurrentAccountOperation, bindToAccountEpoch, isStaleAccountOperation } from '../accountEpoch';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { GitLabSourceControlConnector } from '../../infrastructure/connectors/sourceControl/GitLabSourceControlConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

const GITLAB_BASE_URL = (process.env.GITLAB_URL ?? 'https://gitlab.com').replace(/\/+$/, '');

interface GitLabCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  username: string;
  name?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ username: string; name?: string }> {
  const res = await fetch(`${GITLAB_BASE_URL}/api/v4/user`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`GitLab rejected the new access token (HTTP ${res.status}).`);
  const user = (await res.json()) as { username: string; name?: string };
  return { username: user.username, name: user.name };
}

/** GitLab-as-a-connector — wraps the existing GitLabSourceControlConnector REST class (already
 *  takes a plain bearer token) unchanged. Free-tier connector: no FeatureId gate. */
export class GitLabConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'gitlab',
    displayName: 'GitLab',
    description: 'Read repositories, issues, and merge requests from your GitLab workspace.',
    category: 'sourceControl' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: `${GITLAB_BASE_URL}/oauth/authorize`,
      tokenUrl: `${GITLAB_BASE_URL}/oauth/token`,
      scopes: ['read_api', 'read_repository'],
      clientIdEnvVar: 'GITLAB_CLIENT_ID',
      clientSecretEnvVar: 'GITLAB_CLIENT_SECRET',
      redirectUriEnvVar: 'GITLAB_REDIRECT_URL',
    },
    capabilities: ['readRepositories', 'readMergeRequests', 'readIssues'],
    capabilityDescriptors: [
      { id: 'readRepositories', label: 'Read repositories', description: 'List and read your GitLab projects.' },
      { id: 'readMergeRequests', label: 'Read merge requests', description: 'List and read merge requests.' },
      { id: 'readIssues', label: 'Read issues', description: 'Fetch or search GitLab issues.' },
    ],
  };

  // Account-bound (connectivity/accountEpoch.ts): a token obtained for an account that is no longer
  // signed in is never published here, and reads after an account change find nothing.
  private readonly credentialSlot = new AccountBound<GitLabCredential | undefined>(undefined, 'refuse', 'a GitLab credential');
  private get credential(): GitLabCredential | undefined {
    return this.credentialSlot.get();
  }
  private set credential(value: GitLabCredential | undefined) {
    this.credentialSlot.set(value);
  }
  private readonly statusSlot = new AccountBound<ConnectorStatus>({ state: 'disconnected', capabilities: [] }, 'ignore', 'a GitLab status');
  private get currentStatus(): ConnectorStatus {
    return this.statusSlot.get();
  }
  private set currentStatus(value: ConnectorStatus) {
    this.statusSlot.set(value);
  }
  // Every method runs as an operation of the account signed in when it was called.
  private readonly accountEpochBinding = bindToAccountEpoch(this);

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('sourceControl', new GitLabSourceControlConnector(this.credential?.accessToken, GITLAB_BASE_URL));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<GitLabCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || typeof c.username !== 'string') {
      throw new Error('GitLab credential must include accessToken and username.');
    }
    this.credential = { accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, username: c.username, name: c.name };
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.username };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
      const identity = await fetchIdentity(token.accessToken);
      this.credential = { accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt, ...identity };
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', {
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        grantedScopes: token.grantedScopes,
      });
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.username };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `gitlab:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.name ?? this.credential?.username, username: this.credential?.username },
    };
  }

  /** The local half of disconnect(): forgets the token held in memory — no provider revoke, no vault change. */
  forgetLocalSession(): void {
    // Called from an operation of an account no longer signed in: this connector may now hold the
    // new account's session, which that operation must not clear (its own work was already refused).
    if (isStaleAccountOperation()) return;
    this.credential = undefined;
    infrastructureConnectorRegistry.register('sourceControl', new GitLabSourceControlConnector(undefined, GITLAB_BASE_URL));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    assertCurrentAccountOperation('a GitLab disconnect');
    infrastructureConnectorRegistry.register('sourceControl', new GitLabSourceControlConnector(undefined, GITLAB_BASE_URL));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential?.refreshToken) return;
    try {
      const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
      this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.username };
    } catch (error) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
    }
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'GitLab is not connected.' };
    try {
      await fetchIdentity(this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.username } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(): Promise<unknown> {
    throw new Error('GitLabConnectorSDK.execute: use the existing infrastructureConnectorRegistry sourceControl connector directly.');
  }
}

export const gitLabConnectorSDK = new GitLabConnectorSDK();
