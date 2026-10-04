import { shell } from 'electron';
import { randomUUID } from 'crypto';
import type { ConnectivityScope } from '../../../shared/connectivity/ConnectivityTypes';
import { getMcpProvider, mcpCredentialId } from '../../../shared/connectivity/McpProviders';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { connectionManager } from '../ConnectionManager';
import { generatePkcePair, startLoopbackListener } from '../OAuthManager';

/**
 * The separate, MCP-specific sign-in ('mcpSignIn' providers only — see McpProviders.ts). Some MCP
 * servers run their own OAuth 2.1 authorization server and do not accept the connector's existing
 * token, so PawOS authorises against that server directly:
 *
 *   discovery (RFC 8414) → dynamic client registration (RFC 7591) → authorization code with PKCE
 *   over OAuthManager's loopback redirect → token exchange → refresh.
 *
 * PawOS registers as a public client: there is no client secret to protect, so the exchange and
 * refresh go straight to the provider's token endpoint rather than through pawos-web.
 *
 * The resulting credential is kept in the same Credential Vault and durable store as every other
 * connector credential, under `<connectorId>:mcp`, so it never overwrites or is confused with the
 * connector's own REST/GraphQL token. What the token endpoint needs later for a refresh (the
 * registered client id, the token endpoint, and the refresh token) travels together in the vault's
 * refresh-token slot as one JSON value, because that slot is what the durable store persists.
 */

const AUTHORIZATION_TIMEOUT_MS = 180_000;
const REFRESH_SKEW_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

interface AuthorizationServerMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
}

interface RefreshMaterial {
  refreshToken?: string;
  clientId: string;
  clientSecret?: string;
  tokenEndpoint: string;
}

export class McpSignInError extends Error {}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function encodeRefreshMaterial(material: RefreshMaterial): string {
  return JSON.stringify({ r: material.refreshToken, c: material.clientId, s: material.clientSecret, t: material.tokenEndpoint });
}

export function decodeRefreshMaterial(stored: string | undefined): RefreshMaterial | undefined {
  if (!stored) return undefined;
  try {
    const parsed = JSON.parse(stored) as { r?: unknown; c?: unknown; s?: unknown; t?: unknown };
    if (typeof parsed.c !== 'string' || !isHttpsUrl(parsed.t)) return undefined;
    return {
      refreshToken: typeof parsed.r === 'string' ? parsed.r : undefined,
      clientId: parsed.c,
      clientSecret: typeof parsed.s === 'string' ? parsed.s : undefined,
      tokenEndpoint: parsed.t,
    };
  } catch {
    return undefined;
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

/** RFC 8414: the well-known segment goes between the host and any issuer path; plain suffix as a fallback. */
async function discover(issuer: string): Promise<AuthorizationServerMetadata> {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/+$/, '');
  const candidates = [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}${path}/.well-known/oauth-authorization-server`];
  for (const candidate of [...new Set(candidates)]) {
    const result = await fetchJson(candidate).catch(() => undefined);
    const body = result?.ok ? result.body : undefined;
    if (body && isHttpsUrl(body.authorization_endpoint) && isHttpsUrl(body.token_endpoint)) {
      return {
        authorization_endpoint: body.authorization_endpoint,
        token_endpoint: body.token_endpoint,
        registration_endpoint: isHttpsUrl(body.registration_endpoint) ? body.registration_endpoint : undefined,
      };
    }
  }
  throw new McpSignInError('Could not read the MCP server sign-in configuration.');
}

function tokenFields(body: Record<string, unknown>): { accessToken: string; refreshToken?: string; expiresAt?: number } {
  if (typeof body.access_token !== 'string' || !body.access_token) throw new McpSignInError('The MCP server did not return an access token.');
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    expiresAt: typeof body.expires_in === 'number' ? Date.now() + body.expires_in * 1000 : undefined,
  };
}

class McpOAuthFlow {
  /** Single-flight per connector: providers rotate refresh tokens. */
  private refreshes = new Map<string, Promise<string | undefined>>();

  /**
   * Runs the MCP sign-in for one connector and stores the credential. Opens the system browser, so
   * it is only ever called from an explicit user action. The caller has already checked the
   * connector's entitlement.
   */
  async connect(connectorId: string, scope: ConnectivityScope): Promise<void> {
    const provider = getMcpProvider(connectorId);
    if (!provider || provider.auth !== 'mcpSignIn') throw new McpSignInError(`'${connectorId}' has no separate MCP sign-in.`);

    const metadata = await discover(provider.authorizationServer);
    if (!metadata.registration_endpoint) throw new McpSignInError(`${provider.serverName} does not allow PawOS to register itself.`);

    const loopback = await startLoopbackListener();
    try {
      const registration = await fetchJson(metadata.registration_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_name: 'PawOS',
          redirect_uris: [loopback.redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'native',
        }),
      });
      const clientId = registration.body.client_id;
      if (!registration.ok || typeof clientId !== 'string' || !clientId) {
        throw new McpSignInError(`${provider.serverName} rejected PawOS's client registration (HTTP ${registration.status}).`);
      }
      const clientSecret = typeof registration.body.client_secret === 'string' ? registration.body.client_secret : undefined;

      const pkce = generatePkcePair();
      const authorizeUrl = new URL(metadata.authorization_endpoint);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('redirect_uri', loopback.redirectUri);
      authorizeUrl.searchParams.set('code_challenge', pkce.challenge);
      authorizeUrl.searchParams.set('code_challenge_method', 'S256');
      authorizeUrl.searchParams.set('state', randomUUID());
      authorizeUrl.searchParams.set('resource', provider.endpoint);
      if (provider.mcpScopes.length > 0) authorizeUrl.searchParams.set('scope', provider.mcpScopes.join(' '));
      void shell.openExternal(authorizeUrl.toString());

      let timer: ReturnType<typeof setTimeout> | undefined;
      const callback = await Promise.race([
        loopback.waitForCallback,
        new Promise<{ error: string }>((resolve) => {
          timer = setTimeout(() => resolve({ error: 'The MCP sign-in timed out.' }), AUTHORIZATION_TIMEOUT_MS);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if ('error' in callback) throw new McpSignInError(callback.error);

      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: loopback.redirectUri,
        client_id: clientId,
        code_verifier: pkce.verifier,
        resource: provider.endpoint,
      });
      if (clientSecret) form.set('client_secret', clientSecret);
      const exchange = await fetchJson(metadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form,
      });
      if (!exchange.ok) throw new McpSignInError(`${provider.serverName} rejected the sign-in (HTTP ${exchange.status}).`);
      const tokens = tokenFields(exchange.body);

      const credentialId = mcpCredentialId(connectorId);
      await credentialVaultBridge.store(credentialId, scope, tokens.accessToken, 'oauth2', {
        refreshToken: encodeRefreshMaterial({ refreshToken: tokens.refreshToken, clientId, clientSecret, tokenEndpoint: metadata.token_endpoint }),
        expiresAt: tokens.expiresAt,
      });
      await connectionManager.persistStoredCredential(credentialId, scope);
    } finally {
      loopback.close();
    }
  }

  /** Whether a separate MCP credential is held for this connector (this session or restored). */
  async isConnected(connectorId: string): Promise<boolean> {
    return (await credentialVaultBridge.readLatest(mcpCredentialId(connectorId))) !== undefined;
  }

  /** The MCP access token, refreshed first when it is expired or about to be. Undefined when not signed in. */
  async getAccessToken(connectorId: string): Promise<string | undefined> {
    const credentialId = mcpCredentialId(connectorId);
    const stored = await credentialVaultBridge.readLatest(credentialId);
    if (!stored) return undefined;
    const expiring = stored.expiresAt !== undefined && stored.expiresAt - Date.now() <= REFRESH_SKEW_MS;
    if (!expiring) return stored.secret;

    let pending = this.refreshes.get(connectorId);
    if (!pending) {
      pending = this.refresh(credentialId, stored.scope, stored.refreshToken, stored.secret).finally(() => this.refreshes.delete(connectorId));
      this.refreshes.set(connectorId, pending);
    }
    return pending;
  }

  private async refresh(credentialId: string, scope: ConnectivityScope, storedRefresh: string | undefined, currentToken: string): Promise<string | undefined> {
    const material = decodeRefreshMaterial(storedRefresh);
    if (!material?.refreshToken) return currentToken; // nothing to refresh with; the server will reject it and the gateway reports that
    try {
      const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: material.refreshToken, client_id: material.clientId });
      if (material.clientSecret) form.set('client_secret', material.clientSecret);
      const result = await fetchJson(material.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form,
      });
      if (!result.ok) return currentToken;
      const tokens = tokenFields(result.body);
      await credentialVaultBridge.rotate(credentialId, scope, tokens.accessToken, {
        // Keep the previous refresh token when the server did not rotate it.
        refreshToken: encodeRefreshMaterial({ ...material, refreshToken: tokens.refreshToken ?? material.refreshToken }),
        expiresAt: tokens.expiresAt,
      });
      await connectionManager.persistStoredCredential(credentialId, scope);
      return tokens.accessToken;
    } catch {
      return currentToken;
    }
  }

  /** Removes the separate MCP credential (memory and durable store). */
  async disconnect(connectorId: string, scope: ConnectivityScope): Promise<void> {
    const credentialId = mcpCredentialId(connectorId);
    await credentialVaultBridge.revoke(credentialId, scope);
    await connectionManager.revokeStoredCredential(credentialId, scope);
  }
}

export const mcpOAuthFlow = new McpOAuthFlow();
