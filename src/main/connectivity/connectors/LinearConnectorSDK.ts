import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { LinearConnector } from '../../infrastructure/connectors/projectManagement/LinearConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

interface LinearCredential {
  accessToken: string;
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

/** Team-plan connector — gated by FeatureId 'connectLinear' (see EntitlementService.ts). Wraps the
 *  existing LinearConnector REST class (already takes a plain bearer/API-key token) unchanged. */
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
      scopes: ['read'],
      clientIdEnvVar: 'LINEAR_CLIENT_ID',
      clientSecretEnvVar: 'LINEAR_CLIENT_SECRET',
      redirectUriEnvVar: 'LINEAR_REDIRECT_URL',
    },
    capabilities: ['readIssues'],
    capabilityDescriptors: [{ id: 'readIssues', label: 'Read issues', description: 'Fetch or search Linear issues and projects.' }],
  };

  private credential: LinearCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    infrastructureConnectorRegistry.register('projectManagement', new LinearConnector(this.credential?.accessToken));
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<LinearCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string') throw new Error('Linear credential must include accessToken.');
    this.credential = { accessToken: c.accessToken, name: c.name, organizationName: c.organizationName };
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
      this.credential = { accessToken: token.accessToken, ...identity };
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', { grantedScopes: token.grantedScopes });
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
    await credentialVaultBridge.revoke(this.definition.id, scope);
    infrastructureConnectorRegistry.register('projectManagement', new LinearConnector(undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(_scope: ConnectivityScope): Promise<void> {
    // Linear's current OAuth tokens do not expire — re-validate what's already stored.
    if (!this.credential) return;
    const result = await this.validate(_scope);
    if (!result.valid) this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Linear is not connected.' };
    try {
      await fetchIdentity(this.credential.accessToken);
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
