import { shell } from 'electron';
import { randomUUID, randomBytes, createHash } from 'crypto';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { connectorRegistry } from './ConnectorRegistry';
import { credentialVaultBridge } from './CredentialVaultBridge';
import { registerConnectivityOAuthHandler } from '../auth/OAuthProtocolBridge';
import type { ConnectivityScope } from '../../shared/connectivity/ConnectivityTypes';

/**
 * A completely separate OAuth flow from PawOS's own sign-in
 * (`GoogleOAuthFlow.ts`/`GitHubOAuthFlow.ts`, which authenticate the *user
 * into PawOS*). This flow authorizes PawOS to *act on the user's behalf
 * against a connected external service* (Jira, GitHub-as-a-connector, etc.)
 * — a different concern that happens to reuse the same OAuth2 mechanics.
 * It uses its own deep-link host (`connectivity-oauth-callback`, wired via
 * `registerConnectivityOAuthHandler` below) and its own pending-request map,
 * entirely independent of `OAuthProtocolBridge.ts`'s existing
 * `google`/`github` sign-in dispatch — nothing about that existing flow is
 * read, written, or otherwise touched by this file.
 *
 * Deliberately provider-agnostic: this file only ever reads
 * `ConnectorDefinition.oauth` (a generic shape), never a specific
 * connector's name. It never exchanges the authorization `code` for a
 * token — that step needs each provider's own token endpoint semantics
 * (and, for some, PKCE or client-secret handling), which belongs in that
 * connector's own `authenticate()` implementation, not here.
 */

export const CONNECTIVITY_OAUTH_REDIRECT_URI = 'pawos://connectivity-oauth-callback';

const DEFAULT_TIMEOUT_MS = 120000;

export interface OAuthAuthorizationResult {
  code: string;
  /** Present only for a PKCE connector (`oauth.usePkce`) — the verifier this same process
   *  generated when the authorization began and never sent anywhere but the token endpoint. */
  codeVerifier?: string;
  /** The exact redirect_uri used for THIS request — the loopback URI (with its ephemeral port)
   *  when `oauth.useLoopbackRedirect`, otherwise `CONNECTIVITY_OAUTH_REDIRECT_URI`. The token
   *  endpoint requires an exact match with what the authorize request used, so the connector
   *  must pass this straight through to `exchangeCodeForToken`. */
  redirectUri: string;
}

export interface OAuthAuthorizationHandle {
  requestId: string;
  authorizationUrl: string;
  /** Resolves once the callback arrives, or rejects on error/timeout/cancellation. */
  result: Promise<OAuthAuthorizationResult>;
}

/** What a token endpoint call (exchange or refresh) resolves with — deliberately the same
 *  shape for both, since a connector's own persistence logic treats them identically. */
export interface OAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Parsed from the response's own `scope` field when the provider returns one. Connectors
   *  use this (never the originally-requested list) to compute the live capability set and
   *  the merged `grantedScopes` union, since a provider's actual grant can be narrower — or,
   *  with `include_granted_scopes=true`, wider — than what was requested. */
  grantedScopes?: string[];
}

interface PendingAuthorization {
  connectorId: string;
  scope: ConnectivityScope;
  codeVerifier?: string;
  redirectUri: string;
  resolve: (result: OAuthAuthorizationResult) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  /** Present only for a loopback-redirect request — closes the temporary HTTP listener.
   *  Called on success, timeout, and explicit cancellation alike so the port is never left
   *  bound longer than the single authorization attempt it was opened for. */
  closeLoopbackServer?: () => void;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Standard PKCE (RFC 7636) S256 pair — a fresh one per authorization request, never reused. */
function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * The Google-documented loopback redirect for Desktop-app OAuth clients (replacing the
 * deprecated out-of-band flow): a one-shot local HTTP server on an OS-assigned ephemeral port,
 * torn down the instant it has served the single redirect it exists for. Generic — nothing here
 * is Google-specific; any OAuth connector whose provider requires the same loopback mechanism
 * (rather than a custom URI scheme) reuses this unchanged via `oauth.useLoopbackRedirect`.
 */
function startLoopbackListener(): Promise<{
  redirectUri: string;
  waitForCallback: Promise<{ code: string } | { error: string }>;
  close: () => void;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let settleCallback: (result: { code: string } | { error: string }) => void;
    const waitForCallback = new Promise<{ code: string } | { error: string }>((resolve) => {
      settleCallback = resolve;
    });

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        error
          ? '<html><body>Authorization failed. You can close this window and return to PawOS.</body></html>'
          : '<html><body>You can close this window and return to PawOS.</body></html>'
      );
      if (error) settleCallback({ error });
      else if (code) settleCallback({ code });
      // One redirect is all this listener will ever serve — close it right after, whether
      // the outer caller has finished reacting to `waitForCallback` yet or not.
      server.close();
    });

    server.once('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolveServer({
        redirectUri: `http://127.0.0.1:${port}/oauth2redirect`,
        waitForCallback,
        close: () => server.close(),
      });
    });
  });
}

class OAuthManager {
  /** Keyed by a per-request id (not connectorId), so the same connector —
   *  or even the same connector+scope — can have more than one
   *  authorization in flight at once without colliding. */
  private pending = new Map<string, PendingAuthorization>();

  /** Pure URL construction from `ConnectorDefinition.oauth` — no side
   *  effects beyond generating a fresh PKCE pair when the connector requires one, so it's
   *  independently verifiable and reusable by a future Connections UI that wants to preview the
   *  URL before the user clicks "Connect." Throws if the connector isn't registered, declares no
   *  OAuth config, or its client id env var isn't set — all real configuration errors that must
   *  surface immediately, not silently produce a broken URL. `opts.scopesOverride` requests
   *  exactly those scopes instead of the connector's full declared list — this is what makes an
   *  authorization request "incremental" (see ConnectorSDK.connect's own `opts` param). */
  buildAuthorizationUrl(
    connectorId: string,
    opts?: { scopesOverride?: string[]; redirectUri?: string }
  ): { url: URL; codeVerifier?: string } {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) {
      throw new Error(`Cannot begin authorization — no connector registered with id '${connectorId}'.`);
    }
    const oauth = sdk.definition.oauth;
    if (!oauth) {
      throw new Error(`Connector '${connectorId}' does not declare an OAuth configuration.`);
    }
    const clientId = process.env[oauth.clientIdEnvVar];
    if (!clientId) {
      throw new Error(`Missing environment variable '${oauth.clientIdEnvVar}' required to begin OAuth for connector '${connectorId}'.`);
    }

    const url = new URL(oauth.authorizationUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', opts?.redirectUri ?? CONNECTIVITY_OAUTH_REDIRECT_URI);
    url.searchParams.set('scope', (opts?.scopesOverride ?? oauth.scopes).join(' '));
    url.searchParams.set('response_type', 'code');
    if (oauth.supportsIncrementalAuth) {
      url.searchParams.set('include_granted_scopes', 'true');
    }

    let codeVerifier: string | undefined;
    if (oauth.usePkce) {
      const pkce = generatePkcePair();
      codeVerifier = pkce.verifier;
      url.searchParams.set('code_challenge', pkce.challenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    return { url, codeVerifier };
  }

  /** Registers a pending authorization, opens the provider's consent page in the system
   *  browser, and returns a handle — the `requestId` is what `cancelAuthorization()` needs,
   *  and `result` is what resolves once the callback arrives (or the timeout fires).
   *  `opts.scopesOverride` (see `buildAuthorizationUrl`) is how a connector requests an
   *  incremental grant instead of a full reconnect.
   *
   *  Two redirect delivery mechanisms, chosen per-connector via `oauth.useLoopbackRedirect`:
   *  - Loopback (`useLoopbackRedirect: true`): a temporary `http://127.0.0.1:<ephemeral-port>`
   *    listener is started *before* the authorize URL is built, so the exact port is already
   *    known when Google is asked to redirect to it. Required for Desktop-app OAuth clients,
   *    which reject a custom URI scheme redirect outright.
   *  - Protocol (default, unchanged): the existing `pawos://connectivity-oauth-callback`
   *    dispatch via `handleProtocolCallback`. Registration happens before `shell.openExternal`
   *    so a very fast redirect back into the app can never race ahead of the pending entry
   *    existing. */
  async beginAuthorization(
    connectorId: string,
    scope: ConnectivityScope,
    opts?: { scopesOverride?: string[]; timeoutMs?: number }
  ): Promise<OAuthAuthorizationHandle> {
    const sdk = connectorRegistry.get(connectorId);
    const useLoopback = Boolean(sdk?.definition.oauth?.useLoopbackRedirect);

    const loopback = useLoopback ? await startLoopbackListener() : undefined;
    const { url: baseUrl, codeVerifier } = this.buildAuthorizationUrl(connectorId, {
      scopesOverride: opts?.scopesOverride,
      redirectUri: loopback?.redirectUri,
    });
    const redirectUri = loopback?.redirectUri ?? CONNECTIVITY_OAUTH_REDIRECT_URI;
    const requestId = randomUUID();
    const authorizeUrl = new URL(baseUrl.toString());
    authorizeUrl.searchParams.set('state', requestId);

    const result = new Promise<OAuthAuthorizationResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(requestId);
        loopback?.close();
        reject(new Error(`Authorization for connector '${connectorId}' timed out.`));
      }, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(requestId, {
        connectorId,
        scope,
        codeVerifier,
        redirectUri,
        resolve,
        reject,
        timeoutHandle,
        closeLoopbackServer: loopback?.close,
      });

      if (loopback) {
        loopback.waitForCallback.then((callbackResult) => {
          const entry = this.pending.get(requestId);
          if (!entry) return; // already resolved (timeout/cancel) — a late/duplicate delivery
          clearTimeout(entry.timeoutHandle);
          this.pending.delete(requestId);
          if ('error' in callbackResult) {
            entry.reject(new Error(callbackResult.error));
          } else {
            entry.resolve({ code: callbackResult.code, codeVerifier: entry.codeVerifier, redirectUri: entry.redirectUri });
          }
        });
      }
    });

    void shell.openExternal(authorizeUrl.toString());

    return { requestId, authorizationUrl: authorizeUrl.toString(), result };
  }

  /** Lets a caller (e.g. the user closing a "Connecting..." dialog) abandon
   *  a specific in-flight request without affecting any other pending
   *  authorization. */
  cancelAuthorization(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    clearTimeout(entry.timeoutHandle);
    this.pending.delete(requestId);
    entry.closeLoopbackServer?.();
    entry.reject(new Error('Authorization was cancelled.'));
  }

  listPendingAuthorizations(): string[] {
    return [...this.pending.keys()];
  }

  /** Called by `OAuthProtocolBridge.ts` (via `registerConnectivityOAuthHandler`)
   *  whenever a `pawos://connectivity-oauth-callback` URL is delivered.
   *  Correlates purely via the `state` query param — an unknown or already-
   *  resolved `state` (stale redirect, duplicate delivery) is silently
   *  ignored rather than throwing, since by definition there's no pending
   *  caller left to notify. */
  handleProtocolCallback(url: URL): void {
    const requestId = url.searchParams.get('state');
    if (!requestId) return;
    const entry = this.pending.get(requestId);
    if (!entry) return;

    clearTimeout(entry.timeoutHandle);
    this.pending.delete(requestId);

    const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    if (error) {
      entry.reject(new Error(error));
      return;
    }
    const code = url.searchParams.get('code');
    if (!code) {
      entry.reject(new Error('Connectivity OAuth callback was missing an authorization code.'));
      return;
    }
    // The verifier never left this process — it was generated in buildAuthorizationUrl and
    // stashed on the pending entry, never encoded into the URL Google redirects back with.
    entry.resolve({ code, codeVerifier: entry.codeVerifier, redirectUri: entry.redirectUri });
  }

  /**
   * Generic authorization-code → token exchange for a PKCE/public client — POSTs
   * `oauth.tokenUrl` with grant_type=authorization_code, code, redirect_uri, client_id, and
   * code_verifier (when the connector is PKCE-based). `client_secret` is included only when
   * the connector's own `oauth.clientSecretEnvVar` is set (see that field's doc comment: some
   * providers' installed-app credential types, e.g. Google's "Desktop app" client, still
   * require this value in the token request even though PKCE is used and the value itself
   * isn't meant to stay confidential) — absent for a genuinely secretless public client.
   * Reusable by any future OAuth connector (Microsoft, Dropbox, Slack, Notion, GitHub) either
   * way, with zero new plumbing.
   */
  async exchangeCodeForToken(connectorId: string, code: string, codeVerifier?: string, redirectUri?: string): Promise<OAuthTokenResult> {
    const oauth = this.requireOAuthConfig(connectorId);
    const clientId = this.requireClientId(connectorId, oauth.clientIdEnvVar);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      // Must exactly match whatever redirect_uri the authorize request used — loopback's
      // ephemeral port included — or the token endpoint rejects the exchange.
      redirect_uri: redirectUri ?? CONNECTIVITY_OAUTH_REDIRECT_URI,
      client_id: clientId,
    });
    if (codeVerifier) body.set('code_verifier', codeVerifier);
    const clientSecret = this.optionalClientSecret(connectorId, oauth);
    if (clientSecret) body.set('client_secret', clientSecret);
    return this.postToken(oauth.tokenUrl, body);
  }

  /**
   * Generic refresh-token exchange — POSTs grant_type=refresh_token, including `client_secret`
   * under the same `oauth.clientSecretEnvVar` condition as `exchangeCodeForToken`. Purely
   * reports whatever the provider returned; it does not itself decide what to persist. Most
   * callers should use `refreshAndPersist` instead, which also applies the
   * never-blank-a-valid-refresh-token guarantee via `CredentialVaultBridge.rotate`.
   */
  async refreshAccessToken(connectorId: string, refreshToken: string): Promise<OAuthTokenResult> {
    const oauth = this.requireOAuthConfig(connectorId);
    const clientId = this.requireClientId(connectorId, oauth.clientIdEnvVar);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });
    const clientSecret = this.optionalClientSecret(connectorId, oauth);
    if (clientSecret) body.set('client_secret', clientSecret);
    return this.postToken(oauth.tokenUrl, body);
  }

  /**
   * The one call any OAuth connector's own `refresh(scope)` should make: reads the stored
   * credential, refreshes it, and persists the result through
   * `CredentialVaultBridge.rotate()` — which is where the "never overwrite a valid stored
   * refresh token with an absent/empty one" guarantee actually lives (see its own doc comment).
   * Every future OAuth connector inherits that guarantee automatically just by calling this
   * method instead of hand-rolling its own persistence.
   */
  async refreshAndPersist(
    connectorId: string,
    scope: ConnectivityScope
  ): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number; grantedScopes?: string[] }> {
    const stored = await credentialVaultBridge.read(connectorId, scope);
    if (!stored?.refreshToken) {
      throw new Error(`Cannot refresh — no refresh token stored for connector '${connectorId}' in this scope.`);
    }
    const result = await this.refreshAccessToken(connectorId, stored.refreshToken);
    await credentialVaultBridge.rotate(connectorId, scope, result.accessToken, {
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      grantedScopes: result.grantedScopes ?? stored.grantedScopes,
    });
    const merged = await credentialVaultBridge.read(connectorId, scope);
    return {
      accessToken: result.accessToken,
      refreshToken: merged?.refreshToken,
      expiresAt: merged?.expiresAt,
      grantedScopes: merged?.grantedScopes,
    };
  }

  /**
   * POSTs to `oauth.revocationUrl` when the connector declares one; a logged no-op otherwise —
   * never fabricating a revocation call a provider never documented (same "don't invent
   * deterministic behavior the architecture can't support" posture used throughout this
   * codebase). Does not itself touch the credential vault — the connector's own `disconnect()`
   * calls `credentialVaultBridge.revoke()` separately, same as it always has.
   */
  async revokeToken(connectorId: string, token: string): Promise<void> {
    const sdk = connectorRegistry.get(connectorId);
    const oauth = sdk?.definition.oauth;
    if (!oauth?.revocationUrl) {
      console.warn(`[connectivity] revokeToken: connector '${connectorId}' declares no revocationUrl — nothing to revoke server-side.`);
      return;
    }
    const response = await fetch(oauth.revocationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    if (!response.ok) {
      console.warn(`[connectivity] revokeToken: ${connectorId}'s revocation endpoint returned HTTP ${response.status}.`);
    }
  }

  private requireOAuthConfig(connectorId: string) {
    const sdk = connectorRegistry.get(connectorId);
    if (!sdk) throw new Error(`No connector registered with id '${connectorId}'.`);
    const oauth = sdk.definition.oauth;
    if (!oauth) throw new Error(`Connector '${connectorId}' does not declare an OAuth configuration.`);
    return oauth;
  }

  private requireClientId(connectorId: string, clientIdEnvVar: string): string {
    const clientId = process.env[clientIdEnvVar];
    if (!clientId) throw new Error(`Missing environment variable '${clientIdEnvVar}' required for connector '${connectorId}'.`);
    return clientId;
  }

  /** Returns the connector's client secret only when its `oauth.clientSecretEnvVar` is
   *  declared — a genuinely secretless public client (the common PKCE case) leaves that field
   *  unset and this returns `undefined`, sending no `client_secret` param at all. When the
   *  field IS declared, the env var is required — a declared-but-missing secret must fail
   *  loudly here rather than let the token endpoint reject the request with a confusing
   *  "client_secret is missing" error far from the actual misconfiguration. */
  private optionalClientSecret(connectorId: string, oauth: { clientSecretEnvVar?: string }): string | undefined {
    if (!oauth.clientSecretEnvVar) return undefined;
    const secret = process.env[oauth.clientSecretEnvVar];
    if (!secret) {
      throw new Error(`Missing environment variable '${oauth.clientSecretEnvVar}' required for connector '${connectorId}'.`);
    }
    return secret;
  }

  private async postToken(tokenUrl: string, body: URLSearchParams): Promise<OAuthTokenResult> {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof payload.error_description === 'string'
          ? payload.error_description
          : typeof payload.error === 'string'
            ? payload.error
            : `Token request to ${tokenUrl} failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    const accessToken = payload.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error(`Token response from ${tokenUrl} was missing access_token.`);
    }
    const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined;
    const expiresAt = typeof payload.expires_in === 'number' ? Date.now() + payload.expires_in * 1000 : undefined;
    const grantedScopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : undefined;
    return { accessToken, refreshToken, expiresAt, grantedScopes };
  }
}

export const oauthManager = new OAuthManager();

registerConnectivityOAuthHandler((url) => oauthManager.handleProtocolCallback(url));
