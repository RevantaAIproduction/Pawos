import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import { AccountBound, assertCurrentAccountOperation, bindToAccountEpoch, isStaleAccountOperation } from '../accountEpoch';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { SlackConnector } from '../../infrastructure/connectors/communication/SlackConnector';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

interface SlackCredential {
  accessToken: string;
  teamName: string;
  teamId: string;
}

/**
 * Slack did not exist anywhere in this codebase before this pass — built fresh, following the
 * exact same ConnectorSDK/OAuthManager architecture as every other connector here rather than a
 * bespoke integration. Enterprise-plan connector, gated by FeatureId 'connectSlack' (see
 * EntitlementService.ts). Uses Slack's standard "Add to Slack" OAuth v2 installation flow
 * (oauth.v2.access) — the bot-token shape, not a per-user token, since a workspace-wide bot
 * install is what "connect Slack" means for every other integration on this page.
 *
 * Unlike GitHub/GitLab/Jira/Linear/Vercel/Netlify/Railway, Slack has no existing REST connector
 * class and isn't consumed by any InfrastructureConnectorRegistry-reading plugin today — its
 * capabilities are only ever invoked through this SDK's own execute(), not registered into that
 * shared registry.
 */
export class SlackConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'slack',
    displayName: 'Slack',
    description: 'Post messages and read channels in your Slack workspace.',
    category: 'communication' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['chat:write', 'channels:read', 'groups:read'],
      clientIdEnvVar: 'SLACK_CLIENT_ID',
      clientSecretEnvVar: 'SLACK_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_SLACK_CALLBACK_URL',
    },
    capabilities: ['postMessage', 'readChannels'],
    capabilityDescriptors: [
      { id: 'postMessage', label: 'Post message', description: 'Send a message to a Slack channel.' },
      { id: 'readChannels', label: 'Read channels', description: 'List channels in the connected Slack workspace.' },
    ],
  };

  // Account-bound (connectivity/accountEpoch.ts): a token obtained for an account that is no longer
  // signed in is never published here, and reads after an account change find nothing.
  private readonly credentialSlot = new AccountBound<SlackCredential | undefined>(undefined, 'refuse', 'a Slack credential');
  private get credential(): SlackCredential | undefined {
    return this.credentialSlot.get();
  }
  private set credential(value: SlackCredential | undefined) {
    this.credentialSlot.set(value);
  }
  private readonly statusSlot = new AccountBound<ConnectorStatus>({ state: 'disconnected', capabilities: [] }, 'ignore', 'a Slack status');
  private get currentStatus(): ConnectorStatus {
    return this.statusSlot.get();
  }
  private set currentStatus(value: ConnectorStatus) {
    this.statusSlot.set(value);
  }
  // Every method runs as an operation of the account signed in when it was called.
  private readonly accountEpochBinding = bindToAccountEpoch(this);

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<SlackCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || typeof c.teamName !== 'string') {
      throw new Error('Slack credential must include accessToken and teamName.');
    }
    this.credential = { accessToken: c.accessToken, teamName: c.teamName, teamId: c.teamId ?? '' };
    this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: c.teamName };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);
      const connector = new SlackConnector(token.accessToken);
      const who = await connector.whoAmI();
      if (!who.ok) throw new Error(who.reason);
      this.credential = { accessToken: token.accessToken, teamName: who.identity.teamName, teamId: who.identity.teamId };
      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', { grantedScopes: token.grantedScopes });
      this.currentStatus = { state: 'connected', capabilities: this.capabilities(), connectedAt: new Date().toISOString(), detail: who.identity.teamName };
    } catch (error) {
      this.currentStatus = { state: 'error', capabilities: [], lastError: error instanceof Error ? error.message : String(error) };
      throw error;
    }
    return {
      id: `slack:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { organization: this.credential?.teamName },
    };
  }

  /** The local half of disconnect(): forgets the token held in memory — no provider revoke, no vault change. */
  forgetLocalSession(): void {
    // Called from an operation of an account no longer signed in: this connector may now hold the
    // new account's session, which that operation must not clear (its own work was already refused).
    if (isStaleAccountOperation()) return;
    this.credential = undefined;
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
    assertCurrentAccountOperation('a Slack disconnect');
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(_scope: ConnectivityScope): Promise<void> {
    // Slack's classic bot tokens (this app's scope set) do not expire — re-validate what's
    // already stored instead of attempting a refresh grant that doesn't apply here.
    if (!this.credential) return;
    const result = await this.validate(_scope);
    if (!result.valid) this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Slack is not connected.' };
    const who = await new SlackConnector(this.credential.accessToken).whoAmI();
    return who.ok ? { valid: true } : { valid: false, reason: who.reason };
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid ? { status: 'healthy', detail: this.credential?.teamName } : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(action: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.credential) throw new Error('Slack is not connected.');
    const connector = new SlackConnector(this.credential.accessToken);
    if (action === 'postMessage') return connector.postMessage(String(params.channel), String(params.text));
    if (action === 'readChannels') return connector.listChannels();
    throw new Error(`SlackConnectorSDK does not support action "${action}".`);
  }
}

export const slackConnectorSDK = new SlackConnectorSDK();
