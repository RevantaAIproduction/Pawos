import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { JiraConnector } from '../../infrastructure/connectors/projectManagement/JiraConnector';
import { infrastructureConnectorRegistry } from '../../infrastructure/InfrastructureConnectorRegistry';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

interface JiraCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** The Atlassian Cloud ID this token is scoped to — resolved once via accessible-resources
   *  right after the OAuth exchange, since Jira Cloud's OAuth API is addressed by cloud id
   *  (https://api.atlassian.com/ex/jira/{cloudId}/...), never the site's own atlassian.net URL. */
  cloudId: string;
  siteUrl: string;
  siteName: string;
}

/** https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/#3-2--exchange-authorization-code-for-access-token */
async function fetchAccessibleResource(accessToken: string): Promise<{ cloudId: string; siteUrl: string; siteName: string }> {
  const res = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Could not list accessible Jira sites (HTTP ${res.status}).`);
  const resources = (await res.json()) as Array<{ id: string; url: string; name: string }>;
  const first = resources[0];
  if (!first) throw new Error('This Atlassian account has no Jira site to connect.');
  return { cloudId: first.id, siteUrl: first.url, siteName: first.name };
}

/**
 * Real Atlassian OAuth 2.0 (3LO) connector — replaces the earlier apiToken (email + API token)
 * form entirely; there is no manual-credential path left for Jira. `connect()` drives the same
 * OAuthManager.beginAuthorization -> exchangeCodeForToken round trip every other OAuth connector
 * uses (see GoogleWorkspaceConnectorSDK.ts), then resolves the real Cloud ID via Atlassian's
 * accessible-resources endpoint so JiraConnector's REST calls hit the correct
 * api.atlassian.com/ex/jira/{cloudId} base. The underlying JiraConnector REST class is unchanged
 * except for accepting a bearer credential alongside its original basic-auth one (see
 * JiraConnector.ts) — InvestigateTicketPlugin and everything else reading from
 * infrastructureConnectorRegistry keeps working unmodified.
 */
export class JiraConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'jira',
    displayName: 'Jira',
    description: 'Read tickets, projects, and workflows from your Jira workspace.',
    category: 'projectManagement' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://auth.atlassian.com/authorize',
      tokenUrl: 'https://auth.atlassian.com/oauth/token',
      scopes: ['read:jira-work', 'read:jira-user', 'offline_access'],
      clientIdEnvVar: 'CONNECTOR_JIRA_CLIENT_ID',
      clientSecretEnvVar: 'CONNECTOR_JIRA_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_JIRA_CALLBACK_URL',
      // Atlassian's authorize endpoint requires `audience` to say which API this grant is for,
      // and `prompt=consent` so re-connecting after a revoke always re-shows the consent screen
      // instead of silently reusing a stale grant.
      extraAuthParams: { audience: 'api.atlassian.com', prompt: 'consent' },
    },
    capabilities: ['readTickets'],
    capabilityDescriptors: [
      { id: 'readTickets', label: 'Read tickets', description: 'Fetch or search Jira tickets and their fields.' },
    ],
  };

  private credential: JiraCredential | undefined;
  /** Populated only by authenticate()/connect()/disconnect()/refresh() — getStatus() only ever
   *  reads this field, never derives or fetches it itself. */
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

  private registerLiveConnector(): void {
    const c = this.credential;
    infrastructureConnectorRegistry.register(
      'projectManagement',
      new JiraConnector(c ? `https://api.atlassian.com/ex/jira/${c.cloudId}` : undefined, c ? { mode: 'bearer', accessToken: c.accessToken } : undefined)
    );
  }

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<JiraCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || typeof c.cloudId !== 'string') {
      throw new Error('Jira credential must include accessToken and cloudId.');
    }
    this.credential = { accessToken: c.accessToken, refreshToken: c.refreshToken, expiresAt: c.expiresAt, cloudId: c.cloudId, siteUrl: c.siteUrl ?? '', siteName: c.siteName ?? 'Jira' };
    this.registerLiveConnector();
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: this.credential.siteName };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
      const resource = await fetchAccessibleResource(token.accessToken);
      this.credential = { accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt, ...resource };
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', {
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        grantedScopes: token.grantedScopes,
      });
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: resource.siteName };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `jira:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { accountName: this.credential?.siteName, organization: this.credential?.siteName, siteUrl: this.credential?.siteUrl },
    };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    if (this.credential) {
      await oauthManager.revokeToken(this.definition.id, this.credential.accessToken).catch(() => {});
    }
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    // No unregister() exists on InfrastructureConnectorRegistry (deliberately not added this
    // pass) — replacing the live connector with an unconfigured instance is an honest, equivalent
    // way to report "not connected" without widening that registry's API.
    infrastructureConnectorRegistry.register('projectManagement', new JiraConnector(undefined, undefined));
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential?.refreshToken) return;
    try {
      const result = await oauthManager.refreshAndPersist(this.definition.id, scope);
      this.credential = { ...this.credential, accessToken: result.accessToken, refreshToken: result.refreshToken, expiresAt: result.expiresAt };
      this.registerLiveConnector();
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: this.currentStatus.connectedAt, detail: this.credential.siteName };
    } catch (error) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Strictly read-only — see ConnectorSDK.getStatus's contract. */
  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Jira is not connected.' };
    const res = await fetch(`https://api.atlassian.com/ex/jira/${this.credential.cloudId}/rest/api/3/myself`, {
      headers: { Authorization: `Bearer ${this.credential.accessToken}`, Accept: 'application/json' },
    }).catch(() => null);
    if (!res || !res.ok) return { valid: false, reason: `Jira rejected the stored access token${res ? ` (HTTP ${res.status})` : ''}.` };
    return { valid: true };
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.siteName } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    // Jira webhooks are out of scope this pass (definition declares no `events`) — no-op.
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.credential) throw new Error('Jira is not connected.');
    const connector = new JiraConnector(`https://api.atlassian.com/ex/jira/${this.credential.cloudId}`, { mode: 'bearer', accessToken: this.credential.accessToken });
    if (action === 'getTicket') return connector.getTicket(String(params.ticketId));
    if (action === 'searchTickets') return connector.searchTickets(String(params.query));
    throw new Error(`JiraConnectorSDK does not support action "${action}".`);
  }
}

/** One instance shared by connectorRegistry, the connect/persist plugins, and startup
 *  reconnection — every caller must reference the same instance since it holds the in-memory
 *  credential state. */
export const jiraConnectorSDK = new JiraConnectorSDK();
