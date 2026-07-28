import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { NetlifyConnector } from '../../infrastructure/connectors/hosting/NetlifyConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { guestConnectorCredentialStore } from '../../infrastructure/GuestConnectorCredentialStore';

interface NetlifyCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  fullName?: string;
  email?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ fullName?: string; email?: string }> {
  const res = await fetch('https://api.netlify.com/api/v1/user', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Netlify rejected the new access token (HTTP ${res.status}).`);
  const json = (await res.json()) as { full_name?: string; email?: string };
  return { fullName: json.full_name, email: json.email };
}

/** Free-tier connector: no FeatureId gate. Wraps the existing NetlifyConnector REST class (already
 *  takes a plain bearer token + optional siteId) unchanged — siteId stays unset here (site
 *  selection is a separate, later step, same as the connector's original PAT-based usage). */
export class NetlifyConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'netlify',
    displayName: 'Netlify',
    description: 'Deploy and check deployment status on your Netlify sites.',
    category: 'hosting' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://app.netlify.com/authorize',
      tokenUrl: 'https://api.netlify.com/oauth/token',
      scopes: [],
      clientIdEnvVar: 'CONNECTOR_NETLIFY_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_NETLIFY_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_NETLIFY_CALLBACK_URL',
    },
    capabilities: ['deploy', 'readDeploymentStatus'],
    capabilityDescriptors: [
      { id: 'deploy', label: 'Deploy', description: 'Deploy a site to Netlify.' },
      { id: 'readDeploymentStatus', label: 'Read deployment status', description: 'Check the status of a Netlify deployment.' },
    ],
  };

  private credential: NetlifyCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('hosting', new NetlifyConnector(this.credential?.accessToken, undefined));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<NetlifyCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Netlify credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, fullName: c.fullName, email: c.email };
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.fullName };
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
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.fullName };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `netlify:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.fullName ?? this.credential?.email },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    guestConnectorCredentialStore.remove(this.definition.id);
    infrastructureConnectorRegistry.register('hosting', new NetlifyConnector(undefined, undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential) return;
    // Netlify's OAuth tokens don't expire in the normal case, but if a refresh_token was ever
    // issued, honor it the same way GitLab/Jira/Google Workspace already do rather than silently
    // discarding it.
    if (this.credential.refreshToken) {
      try {
        const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
        this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
        this.registerLiveConnector();
        this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.fullName };
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
    if (!this.credential) return { valid: false, reason: 'Netlify is not connected.' };
    try {
      await fetchIdentity(this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.fullName } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(): Promise<unknown> {
    throw new Error('NetlifyConnectorSDK.execute: use the existing infrastructureConnectorRegistry hosting connector directly.');
  }
}

export const netlifyConnectorSDK = new NetlifyConnectorSDK();
