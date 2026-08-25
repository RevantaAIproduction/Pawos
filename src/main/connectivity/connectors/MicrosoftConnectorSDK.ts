import type { ConnectorSDK } from '../../../shared/connectivity/ConnectorSDK';
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

  private credential: MicrosoftCredential | undefined;
  private currentStatus: ConnectorStatus = { state: 'disconnected', capabilities: [] };

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

      // Extract user info from token (Microsoft includes id_token with user claims)
      let displayName = 'Microsoft Account';
      let userPrincipalName = 'user@microsoft.com';
      let userId = '';

      try {
        // Try to extract from id_token claims if available
        if (token.idToken) {
          const payload = JSON.parse(Buffer.from(token.idToken.split('.')[1], 'base64').toString());
          displayName = payload.name || payload.email || displayName;
          userPrincipalName = payload.email || payload.preferred_username || userPrincipalName;
          userId = payload.oid || '';
        }
      } catch {
        // If parsing fails, fall back to defaults
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
        metadata: { userPrincipalName, displayName, userId },
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

  async disconnect(scope: ConnectivityScope): Promise<void> {
    this.credential = undefined;
    await credentialVaultBridge.revoke(this.definition.id, scope);
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
