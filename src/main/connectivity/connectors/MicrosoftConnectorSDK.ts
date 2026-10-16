import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
import { AccountBound, assertCurrentAccountOperation, bindToAccountEpoch, isStaleAccountOperation } from '../accountEpoch';
import type { ConnectivityScope, ConnectorConnection, ConnectorStatus, NormalizedConnectivityEvent } from '../../../shared/connectivity/ConnectivityTypes';
import { oauthManager } from '../OAuthManager';
import { credentialVaultBridge } from '../CredentialVaultBridge';

interface MicrosoftCredential {
  accessToken: string;
  refreshToken?: string;
  userPrincipalName: string;
  displayName: string;
  userId: string;
}

/**
 * Microsoft connector for connecting a user's Microsoft account to PawOS.
 * Gated by FeatureId 'connectMicrosoft' (see EntitlementService.ts).
 * Uses Microsoft's OAuth2 authorization code flow with PKCE.
 *
 * Initial connection requests only identity and offline permissions.
 * Graph permissions (Mail.Read, Calendars.Read, etc.) are requested incrementally
 * when corresponding PawOS capabilities are actually implemented.
 */
export class MicrosoftConnectorSDK implements ConnectorSDK {
  readonly definition = {
    id: 'microsoft',
    displayName: 'Connect your Microsoft account',
    description: 'Connect your Microsoft account to let PawOS create and work with Excel spreadsheets, Word documents, and other Microsoft services.',
    category: 'productivity' as const,
    authMethod: 'oauth2' as const,
    oauth: {
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      clientIdEnvVar: 'MICROSOFT_CLIENT_ID',
      clientSecretEnvVar: 'MICROSOFT_CLIENT_SECRET',
      redirectUriEnvVar: 'CONNECTOR_MICROSOFT_CALLBACK_URL',
    },
    capabilities: ['readIdentity'],
    capabilityDescriptors: [
      { id: 'readIdentity', label: 'Account connection', description: 'Connect your Microsoft account to PawOS.' },
    ],
  };

  // Account-bound (connectivity/accountEpoch.ts): a token obtained for an account that is no longer
  // signed in is never published here, and reads after an account change find nothing.
  private readonly credentialSlot = new AccountBound<MicrosoftCredential | undefined>(undefined, 'refuse', 'a Microsoft credential');
  private get credential(): MicrosoftCredential | undefined {
    return this.credentialSlot.get();
  }
  private set credential(value: MicrosoftCredential | undefined) {
    this.credentialSlot.set(value);
  }
  private readonly statusSlot = new AccountBound<ConnectorStatus>({ state: 'disconnected', capabilities: [] }, 'ignore', 'a Microsoft status');
  private get currentStatus(): ConnectorStatus {
    return this.statusSlot.get();
  }
  private set currentStatus(value: ConnectorStatus) {
    this.statusSlot.set(value);
  }
  // Every method runs as an operation of the account signed in when it was called.
  private readonly accountEpochBinding = bindToAccountEpoch(this);

  async authenticate(_scope: ConnectivityScope, credential: unknown): Promise<void> {
    const c = credential as Partial<MicrosoftCredential> | null | undefined;
    if (!c || typeof c.accessToken !== 'string' || typeof c.userPrincipalName !== 'string') {
      throw new Error('Microsoft credential must include accessToken and userPrincipalName.');
    }
    this.credential = {
      accessToken: c.accessToken,
      refreshToken: c.refreshToken,
      userPrincipalName: c.userPrincipalName,
      displayName: c.displayName ?? c.userPrincipalName,
      userId: c.userId ?? '',
    };
    this.currentStatus = {
      state: 'connected',
      capabilities: this.capabilities(),
      connectedAt: new Date().toISOString(),
      detail: c.displayName || c.userPrincipalName,
    };
  }

  async connect(scope: ConnectivityScope): Promise<ConnectorConnection> {
    this.currentStatus = { state: 'connecting', capabilities: [] };
    try {
      const handle = await oauthManager.beginAuthorization(this.definition.id, scope);
      const { code, codeVerifier, redirectUri } = await handle.result;
      const token = await oauthManager.exchangeCodeForToken(this.definition.id, code, codeVerifier, redirectUri);

      // OAuthTokenResult never carries an id_token (the shared backend exchange
      // path only surfaces access_token/refresh_token/expires_in/scope), so user
      // identity is fetched from Microsoft Graph with the access token itself —
      // the same pattern SlackConnectorSDK.connect() uses via whoAmI().
      let displayName = 'Microsoft Account';
      let userPrincipalName = 'user@microsoft.com';
      let userId = '';

      try {
        const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });
        if (profileResponse.ok) {
          const profile = (await profileResponse.json()) as {
            displayName?: string;
            mail?: string;
            userPrincipalName?: string;
            id?: string;
          };
          displayName = profile.displayName || displayName;
          userPrincipalName = profile.mail || profile.userPrincipalName || userPrincipalName;
          userId = profile.id || '';
        }
      } catch {
        // If the Graph call fails, fall back to defaults — the connection
        // itself still succeeded since the token exchange already completed.
      }

      this.credential = {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        userPrincipalName,
        displayName,
        userId,
      };

      await credentialVaultBridge.store(this.definition.id, scope, token.accessToken, 'oauth2', {
        grantedScopes: token.grantedScopes,
        refreshToken: token.refreshToken,
      });

      this.currentStatus = {
        state: 'connected',
        capabilities: this.capabilities(),
        connectedAt: new Date().toISOString(),
        detail: displayName,
      };
    } catch (error) {
      this.currentStatus = {
        state: 'error',
        capabilities: [],
        lastError: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }

    return {
      id: `microsoft:${scope.userId}`,
      connectorId: this.definition.id,
      scope,
      status: 'connected',
      grantedPermissions: this.capabilities(),
      lastSyncAt: Date.now(),
      metadata: { account: this.credential?.displayName || this.credential?.userPrincipalName },
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
    assertCurrentAccountOperation('a Microsoft disconnect');
    this.currentStatus = { state: 'disconnected', capabilities: [] };
  }

  async refresh(scope: ConnectivityScope): Promise<void> {
    if (!this.credential || !this.credential.refreshToken) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: 'Refresh token not available' };
      return;
    }
    // Token refresh is handled by OAuthManager and credentialVaultBridge
    // Validate the connection is still valid
    const result = await this.validate(scope);
    if (!result.valid) {
      this.currentStatus = { state: 'requiresReauth', capabilities: [], lastError: result.reason };
    }
  }

  async getStatus(_scope: ConnectivityScope): Promise<ConnectorStatus> {
    return { ...this.currentStatus, capabilities: this.capabilities() };
  }

  async validate(_scope: ConnectivityScope): Promise<{ valid: boolean; reason?: string }> {
    if (!this.credential) return { valid: false, reason: 'Microsoft account is not connected.' };
    // Basic validation: if we have a credential, assume it's valid
    // More thorough validation would call Microsoft Graph /me endpoint
    return { valid: true };
  }

  async health(scope: ConnectivityScope): Promise<{ status: 'healthy' | 'degraded' | 'down'; detail?: string }> {
    const result = await this.validate(scope);
    return result.valid
      ? { status: 'healthy', detail: this.credential?.displayName }
      : { status: 'down', detail: result.reason };
  }

  capabilities(): string[] {
    return this.credential ? [...this.definition.capabilities] : [];
  }

  subscribe(_eventType: string, _handler: (event: NormalizedConnectivityEvent) => void): () => void {
    return () => {};
  }

  unsubscribe(_eventType: string): void {}

  async execute(action: string, _params: Record<string, unknown>): Promise<unknown> {
    if (!this.credential) throw new Error('Microsoft account is not connected.');
    if (action === 'readIdentity') {
      return {
        userPrincipalName: this.credential.userPrincipalName,
        displayName: this.credential.displayName,
        userId: this.credential.userId,
      };
    }
    throw new Error(`MicrosoftConnectorSDK does not support action "${action}".`);
  }
}

export const microsoftConnectorSDK = new MicrosoftConnectorSDK();
