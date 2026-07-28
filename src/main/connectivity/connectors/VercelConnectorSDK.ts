import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { VercelConnector } from '../../infrastructure/connectors/hosting/VercelConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { guestConnectorCredentialStore } from '../../infrastructure/GuestConnectorCredentialStore';

interface VercelCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  username?: string;
  email?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ username?: string; email?: string }> {
  const res = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Vercel rejected the new access token (HTTP ${res.status}).`);
  const json = (await res.json()) as { user?: { username?: string; email?: string } };
  return { username: json.user?.username, email: json.user?.email };
}

/** Free-tier connector: no FeatureId gate. Wraps the existing VercelConnector REST class (already
 *  takes a plain bearer token) unchanged. */
export class VercelConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'vercel',
    displayName: 'Vercel',
    description: 'Deploy and check deployment status on your Vercel projects.',
    category: 'hosting' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://vercel.com/oauth/authorize',
      tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
      scopes: [],
      clientIdEnvVar: 'CONNECTOR_VERCEL_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_VERCEL_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_VERCEL_CALLBACK_URL',
    },
    capabilities: ['deploy', 'readDeploymentStatus'],
    capabilityDescriptors: [
      { id: 'deploy', label: 'Deploy', description: 'Deploy a project to Vercel.' },
      { id: 'readDeploymentStatus', label: 'Read deployment status', description: 'Check the status of a Vercel deployment.' },
    ],
  };

  private credential: VercelCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('hosting', new VercelConnector(this.credential?.accessToken));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<VercelCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Vercel credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, username: c.username, email: c.email };
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
      if (scope.userId === 'guest') guestConnectorCredentialStore.save(this.definition.id, { bundle: JSON.stringify(this.credential) });
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.username };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `vercel:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.username ?? this.credential?.email },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    guestConnectorCredentialStore.remove(this.definition.id);
    infrastructureConnectorRegistry.register('hosting', new VercelConnector(undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential) return;
    // Vercel's OAuth integration tokens don't expire in the normal case, but if this app's OAuth
    // client is ever issued a refresh_token (a rotation or scope change on Vercel's side), honor
    // it the same way GitLab/Jira/Google Workspace already do rather than silently discarding it.
    if (this.credential.refreshToken) {
      try {
        const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
        this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
        this.registerLiveConnector();
        this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.username };
        return;
      } catch (error) {
        this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
        return;
      }
    }
    const result = await this.validate(scope);
    if (!result.valid) this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Vercel is not connected.' };
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
    throw new Error('VercelConnectorSDK.execute: use the existing infrastructureConnectorRegistry hosting connector directly.');
  }
}

export const vercelConnectorSDK = new VercelConnectorSDK();
