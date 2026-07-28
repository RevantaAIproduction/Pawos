import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { RailwayConnector } from '../../infrastructure/connectors/hosting/RailwayConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { guestConnectorCredentialStore } from '../../infrastructure/GuestConnectorCredentialStore';

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

interface RailwayCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  name?: string;
  email?: string;
}

async function fetchIdentity(accessToken: string): Promise<{ name?: string; email?: string }> {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ me { name email } }' }),
  });
  if (!res.ok) throw new Error(`Railway rejected the new access token (HTTP ${res.status}).`);
  const json = (await res.json()) as { data?: { me?: { name?: string; email?: string } } };
  return { name: json.data?.me?.name, email: json.data?.me?.email };
}

/**
 * Free-tier connector: no FeatureId gate. Wraps the existing RailwayConnector REST/GraphQL class
 * (already takes a plain bearer token, plus optional projectId/serviceId set later during
 * deployment-profile selection) unchanged.
 *
 * Railway's third-party OAuth app authorize/token endpoints are inferred from their public OAuth
 * documentation rather than confirmed against a live exchange this session — if the authorize step
 * 404s or rejects the client, verify these two URLs against Railway's current OAuth app dashboard
 * and correct them here (nowhere else needs to change).
 */
export class RailwayConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'railway',
    displayName: 'Railway',
    description: 'Deploy and check deployment status on your Railway projects.',
    category: 'hosting' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://backboard.railway.app/oauth/authorize',
      tokenUrl: 'https://backboard.railway.app/oauth/token',
      scopes: [],
      clientIdEnvVar: 'CONNECTOR_RAILWAY_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_RAILWAY_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_RAILWAY_CALLBACK_URL',
    },
    capabilities: ['deploy', 'readDeploymentStatus'],
    capabilityDescriptors: [
      { id: 'deploy', label: 'Deploy', description: 'Deploy a project to Railway.' },
      { id: 'readDeploymentStatus', label: 'Read deployment status', description: 'Check the status of a Railway deployment.' },
    ],
  };

  private credential: RailwayCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('hosting', new RailwayConnector(this.credential?.accessToken, undefined, undefined));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<RailwayCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Railway credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, name: c.name, email: c.email };
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.name };
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
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: identity.name };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `railway:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.name ?? this.credential?.email },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    guestConnectorCredentialStore.remove(this.definition.id);
    infrastructureConnectorRegistry.register('hosting', new RailwayConnector(undefined, undefined, undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential) return;
    // Railway's OAuth token lifetime isn't confirmed (see this file's own doc comment on the
    // inferred endpoints) — if a refresh_token was issued, honor it the same way GitLab/Jira/
    // Google Workspace already do rather than silently discarding it.
    if (this.credential.refreshToken) {
      try {
        const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
        this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
        this.registerLiveConnector();
        this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.name };
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
    if (!this.credential) return { valid: false, reason: 'Railway is not connected.' };
    try {
      await fetchIdentity(this.credential.accessToken);
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.name } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(): Promise<unknown> {
    throw new Error('RailwayConnectorSDK.execute: use the existing infrastructureConnectorRegistry hosting connector directly.');
  }
}

export const railwayConnectorSDK = new RailwayConnectorSDK();
