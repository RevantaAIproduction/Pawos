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

/**
 * Fixed local port a hosted-relay connector's final hop lands on — see
 * `ensureConnectivityRelayListener()` below for why this replaces the `pawos://` custom-protocol
 * delivery for these connectors specifically. Deliberately a different port than the 51899 used
 * by PawOS's own Google/GitHub sign-in (GoogleOAuthFlow.ts/GitHubOAuthFlow.ts) — kept independent
 * since, unlike sign-in, more than one connector authorization can legitimately be in flight at
 * once (see beginAuthorization's own doc comment), so this listener is long-lived rather than
 * one-shot-per-attempt. pawos-web's desktopRelay.ts (relayConnectivityToDesktop) must redirect to
 * the exact same port.
 */
export const CONNECTIVITY_LOCAL_RELAY_PORT = 51900;

/** pawos-web's hosted origin — the only place a connector OAuth client_secret ever lives. Matches
 *  the domain already used for checkout (see RazorpayBillingProvider.ts's WEB_CHECKOUT_BASE_URL). */
const CONNECTIVITY_OAUTH_BACKEND_BASE_URL = 'https://pawos.revantaai.com';

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

  /** Started lazily, once, the first time a hosted-relay connector authorization needs it — see
   *  `ensureConnectivityRelayListener()`. */
  private connectivityRelayServer: http.Server | undefined;

  /**
   * A persistent local HTTP listener that receives the final hop of a hosted-relay connector
   * OAuth flow (pawos-web's desktopRelay.ts `relayConnectivityToDesktop`) — replacing the
   * `pawos://connectivity-oauth-callback` custom-protocol handoff those connectors (Jira, Slack,
   * GitLab, GitHub-as-connector, Vercel, Netlify, Railway) previously relied on exclusively.
   * Chromium-based browsers on Windows can silently block a script-driven navigation to a custom
   * protocol scheme with no error shown when it doesn't read as a fresh, direct user gesture — a
   * full OAuth redirect chain never does, even though the flow started from a real click. This is
   * the exact issue already found and fixed for PawOS's own Google/GitHub sign-in (see
   * GoogleOAuthFlow.ts/GitHubOAuthFlow.ts's own doc comments) via a same-machine loopback HTTP
   * redirect instead — this applies that identical, proven fix here. A plain `http://127.0.0.1`
   * navigation is not subject to the custom-protocol gate at all, so the relay page's automatic
   * redirect now reliably completes without requiring the user to notice and click a fallback
   * button. Unlike the sign-in flows' one-shot-per-attempt listener, this one is started once and
   * left running for the app's lifetime, dispatching each delivery by its `state` query param
   * through the same `handleProtocolCallback` correlation logic the `pawos://` path already
   * uses — so more than one connector authorization can still be in flight at once without the
   * fixed port becoming a bottleneck.
   */
  private ensureConnectivityRelayListener(): void {
    if (this.connectivityRelayServer) return;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${CONNECTIVITY_LOCAL_RELAY_PORT}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>You can close this window and return to PawOS.</body></html>');
      this.handleProtocolCallback(url);
    });
    server.on('error', (err) => {
      console.warn(
        `[connectivity] connectivity relay listener error on port ${CONNECTIVITY_LOCAL_RELAY_PORT}: ${err instanceof Error ? err.message : err}`
      );
    });
    server.listen(CONNECTIVITY_LOCAL_RELAY_PORT, '127.0.0.1');
    this.connectivityRelayServer = server;
  }

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
    if (oauth.extraAuthParams) {
      for (const [key, value] of Object.entries(oauth.extraAuthParams)) url.searchParams.set(key, value);
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
    const oauth = sdk?.definition.oauth;
    const useLoopback = Boolean(oauth?.useLoopbackRedirect);
    // A connector whose provider's OAuth app was registered with one specific, already-hosted
    // callback URL (rather than PawOS's pawos:// custom scheme) declares that URL's env var name
    // here — see OAuthConnectorConfig.redirectUriEnvVar's own doc comment.
    const staticRedirectUri = !useLoopback && oauth?.redirectUriEnvVar ? process.env[oauth.redirectUriEnvVar] : undefined;
    if (!useLoopback && oauth?.redirectUriEnvVar && !staticRedirectUri) {
      throw new Error(`Missing environment variable '${oauth.redirectUriEnvVar}' required to begin OAuth for connector '${connectorId}'.`);
    }

    const loopback = useLoopback ? await startLoopbackListener() : undefined;
    if (!useLoopback && staticRedirectUri) {
      // A hosted-relay connector (its provider requires one pre-registered, static callback
      // URL — Atlassian doesn't accept a dynamic loopback port for Jira's OAuth app config) — the
      // fixed-port listener is what receives the relay's final hop, see its own doc comment.
      this.ensureConnectivityRelayListener();
    }
    const { url: baseUrl, codeVerifier } = this.buildAuthorizationUrl(connectorId, {
      scopesOverride: opts?.scopesOverride,
      redirectUri: loopback?.redirectUri ?? staticRedirectUri,
    });
    const redirectUri = loopback?.redirectUri ?? staticRedirectUri ?? CONNECTIVITY_OAUTH_REDIRECT_URI;
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
   * Authorization-code → token exchange. Unlike a sign-in-only flow, connector OAuth needs a
   * real client_secret for every provider here (none of GitHub/GitLab/Linear/Jira/Vercel/
   * Netlify/Railway/Slack/Google Workspace issue secretless public clients for this kind of
   * offline-access grant) — so this never touches the provider's token endpoint directly from
   * Electron. It POSTs to pawos-web's `/api/connectivity/oauth/exchange` instead, which holds
   * every provider's client_secret in its own server environment and performs the actual
   * `oauth.tokenUrl` request — the exact same "secret lives only in the hosted backend" shape
   * already used for PawOS's own Google/GitHub sign-in (see pawos-web/src/lib/desktopRelay.ts).
   * Electron only ever sends/receives the non-secret authorization code and the finished
   * tokens. Reusable unmodified by any future OAuth connector: this file no longer needs to
   * know a single provider's secret, PKCE-ness, or token-endpoint quirks — pawos-web's own
   * provider config (connectivityOAuthProviders.ts) is where that detail lives now.
   */
  async exchangeCodeForToken(connectorId: string, code: string, codeVerifier?: string, redirectUri?: string): Promise<OAuthTokenResult> {
    return this.exchangeViaBackend(connectorId, {
      grant_type: 'authorization_code',
      code,
      // Must exactly match whatever redirect_uri the authorize request used — loopback's
      // ephemeral port included — or the token endpoint rejects the exchange.
      redirect_uri: redirectUri ?? CONNECTIVITY_OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
    });
  }

  /**
   * Generic refresh-token exchange, routed through the same pawos-web backend endpoint as
   * `exchangeCodeForToken` — see that method's doc comment for why. Purely reports whatever the
   * provider returned; it does not itself decide what to persist. Most callers should use
   * `refreshAndPersist` instead, which also applies the never-blank-a-valid-refresh-token
   * guarantee via `CredentialVaultBridge.rotate`.
   */
  async refreshAccessToken(connectorId: string, refreshToken: string): Promise<OAuthTokenResult> {
    return this.exchangeViaBackend(connectorId, { grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async exchangeViaBackend(
    connectorId: string,
    params: { grant_type: string; code?: string; redirect_uri?: string; code_verifier?: string; refresh_token?: string }
  ): Promise<OAuthTokenResult> {
    const response = await fetch(`${CONNECTIVITY_OAUTH_BACKEND_BASE_URL}/api/connectivity/oauth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorId, ...params }),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = typeof payload.error === 'string' ? payload.error : `Token exchange for '${connectorId}' failed with HTTP ${response.status}.`;
      throw new Error(message);
    }
    const accessToken = payload.access_token;
    if (typeof accessToken !== 'string' || !accessToken) {
      throw new Error(`Token exchange for '${connectorId}' did not return an access_token.`);
    }
    const refreshToken = typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined;
    const expiresAt = typeof payload.expires_in === 'number' ? Date.now() + payload.expires_in * 1000 : undefined;
    const grantedScopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : undefined;
    return { accessToken, refreshToken, expiresAt, grantedScopes };
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

  private requireClientId(connectorId: string, clientIdEnvVar: string): string {
    const clientId = process.env[clientIdEnvVar];
    if (!clientId) throw new Error(`Missing environment variable '${clientIdEnvVar}' required for connector '${connectorId}'.`);
    return clientId;
  }
}

export const oauthManager = new OAuthManager();

registerConnectivityOAuthHandler((url) => oauthManager.handleProtocolCallback(url));
