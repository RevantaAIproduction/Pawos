import { shell } from 'electron';
import { randomUUID } from 'crypto';
import { connectorRegistry } from './ConnectorRegistry';
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
}

export interface OAuthAuthorizationHandle {
  requestId: string;
  authorizationUrl: string;
  /** Resolves once the callback arrives, or rejects on error/timeout/cancellation. */
  result: Promise<OAuthAuthorizationResult>;
}

interface PendingAuthorization {
  connectorId: string;
  scope: ConnectivityScope;
  resolve: (result: OAuthAuthorizationResult) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

class OAuthManager {
  /** Keyed by a per-request id (not connectorId), so the same connector —
   *  or even the same connector+scope — can have more than one
   *  authorization in flight at once without colliding. */
  private pending = new Map<string, PendingAuthorization>();

  /** Pure URL construction from `ConnectorDefinition.oauth` — no side
   *  effects, so it's independently verifiable and reusable by a future
   *  Connections UI that wants to preview the URL before the user clicks
   *  "Connect." Throws if the connector isn't registered, declares no
   *  OAuth config, or its client id env var isn't set — all real
   *  configuration errors that must surface immediately, not silently
   *  produce a broken URL. */
  buildAuthorizationUrl(connectorId: string): URL {
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
    url.searchParams.set('redirect_uri', CONNECTIVITY_OAUTH_REDIRECT_URI);
    url.searchParams.set('scope', oauth.scopes.join(' '));
    url.searchParams.set('response_type', 'code');
    return url;
  }

  /** Registers a pending authorization, opens the provider's consent page
   *  in the system browser, and returns immediately with a handle — the
   *  `requestId` is what `cancelAuthorization()` needs, and `result` is
   *  what resolves once `handleProtocolCallback` (or the timeout) fires.
   *  Registration happens before `shell.openExternal` so a very fast
   *  redirect back into the app can never race ahead of the pending
   *  entry existing. */
  beginAuthorization(connectorId: string, scope: ConnectivityScope, timeoutMs: number = DEFAULT_TIMEOUT_MS): OAuthAuthorizationHandle {
    const baseUrl = this.buildAuthorizationUrl(connectorId);
    const requestId = randomUUID();
    const authorizeUrl = new URL(baseUrl.toString());
    authorizeUrl.searchParams.set('state', requestId);

    const result = new Promise<OAuthAuthorizationResult>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Authorization for connector '${connectorId}' timed out.`));
      }, timeoutMs);
      this.pending.set(requestId, { connectorId, scope, resolve, reject, timeoutHandle });
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
    entry.resolve({ code });
  }
}

export const oauthManager = new OAuthManager();

registerConnectivityOAuthHandler((url) => oauthManager.handleProtocolCallback(url));
