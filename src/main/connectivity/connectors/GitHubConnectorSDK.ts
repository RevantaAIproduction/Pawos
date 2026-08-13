import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { GitHubSourceControlConnector } from '../../infrastructure/connectors/sourceControl/GitHubSourceControlConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

interface GitHubCredential {
  accessToken: string;
  login: string;
  name?: string;
  avatarUrl?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ login: string; name?: string; avatarUrl?: string }> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub rejected the new access token (HTTP ${res.status}).`);
  const user = (await res.json()) as { login: string; name?: string; avatar_url?: string };
  return { login: user.login, name: user.name ?? undefined, avatarUrl: user.avatar_url };
}

/**
 * GitHub-as-a-connector — a distinct OAuth app from PawOS's own GitHub sign-in (see
 * CONNECTOR_GITHUB_CLIENT_ID's doc comment in pawos-web/src/lib/connectivityOAuthProviders.ts for
 * why they can't share one). Wraps the existing GitHubSourceControlConnector REST class (already
 * takes a plain bearer token, previously only ever a manually-configured GITHUB_TOKEN) unchanged —
 * this SDK only supplies that token from a real OAuth grant instead. Free-tier connector: no
 * FeatureId gate (see EntitlementService.ts).
 */
export class GitHubConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'github',
    displayName: 'GitHub',
    description: 'Read repositories, issues, and pull requests from your GitHub account.',
    category: 'sourceControl' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'read:org'],
      clientIdEnvVar: 'CONNECTOR_GITHUB_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_GITHUB_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_GITHUB_CALLBACK_URL',
    },
    capabilities: ['readRepositories', 'readPullRequests', 'readIssues'],
    capabilityDescriptors: [
      { id: 'readRepositories', label: 'Read repositories', description: 'List and read your GitHub repositories.' },
      { id: 'readPullRequests', label: 'Read pull requests', description: 'List and read pull requests, including AI PR review.' },
      { id: 'readIssues', label: 'Read issues', description: 'Fetch or search GitHub issues.' },
    ],
  };

  private credential: GitHubCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('sourceControl', new GitHubSourceControlConnector(this.credential?.accessToken));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<GitHubCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || typeof c.login !== 'string') {
      throw new Error('GitHub credential must include accessToken and login.');
    }
    this.credential = { accessToken: c.accessToken, login: c.login, name: c.name, avatarUrl: c.avatarUrl };
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.login };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
      const identity = await fetchIdentity(token.accessToken);
      this.credential = { accessToken: token.accessToken, ...identity };
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', { grantedScopes: token.grantedScopes });
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.login };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `github:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.name ?? this.credential?.login, login: this.credential?.login, avatarUrl: this.credential?.avatarUrl },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    infrastructureConnectorRegistry.register('sourceControl', new GitHubSourceControlConnector(undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(_scope: ConnectivityScope): Promise<void> {
    // GitHub OAuth Apps issue non-expiring tokens by default (no refresh_token) — re-validate
    // what's already stored instead of attempting a refresh grant that doesn't apply here.
    if (!this.credential) return;
    const result = await this.validate(_scope);
    if (!result.valid) this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'GitHub is not connected.' };
    try {
      await fetchIdentity(this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.login } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(_action: string, _params: Record<string, unknown>): Promise<unknown> {
    throw new Error('GitHubConnectorSDK.execute: use the existing infrastructureConnectorRegistry sourceControl connector directly.');
  }
}

export const gitHubConnectorSDK = new GitHubConnectorSDK();
