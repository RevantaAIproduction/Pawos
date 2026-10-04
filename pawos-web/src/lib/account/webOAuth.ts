import { randomBytes } from "crypto";
import type { AccountContext } from "./accountContext";
import { getConnectivityOAuthProviderConfig } from "../connectivityOAuthProviders";

/**
 * Connector OAuth started from PawOS Web. This is the web half of the existing connector
 * architecture, not a second one: the same OAuth consumer, the same hosted callback URL the
 * desktop app uses, the same token endpoint config (connectivityOAuthProviders.ts) and the same
 * credential store — tokens go straight into the Supabase Vault-backed connectivity_credentials
 * through store_connectivity_credential(), the function the desktop app's
 * ConnectivityCredentialService calls. The desktop app then activates the connection the next time
 * it restores credentials.
 *
 * One callback URL serves both apps. A flow started here carries a state beginning with "web." and
 * is tied to the browser by an httpOnly cookie; anything else is a desktop flow and is relayed to
 * the desktop app exactly as before.
 *
 * Tokens never reach the browser: not in a response body, not in a query string, not in a cookie.
 * Only connectors whose desktop SDK can activate from tokens alone are listed here.
 */

export const WEB_OAUTH_STATE_COOKIE = "pawos_connector_oauth";
export const WEB_OAUTH_STATE_MAX_AGE_SECONDS = 600;
const WEB_STATE_PREFIX = "web.";

interface WebOAuthProvider {
  authorizationUrl: string;
  scopes: string[];
  redirectUri: string;
  identityUrl: string;
  /** Capabilities recorded on the connection — the connector's own declared list. */
  capabilities: string[];
}

const WEB_OAUTH_PROVIDERS: Record<string, WebOAuthProvider> = {
  bitbucket: {
    authorizationUrl: "https://bitbucket.org/site/oauth2/authorize",
    scopes: ["account", "repository", "pullrequest:write"],
    redirectUri: "https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback",
    identityUrl: "https://api.bitbucket.org/2.0/user",
    capabilities: ["readRepositories", "readPullRequests"],
  },
};

export function supportsWebOAuth(connectorId: string): boolean {
  return connectorId in WEB_OAUTH_PROVIDERS;
}

export function isWebOAuthState(state: string | null): state is string {
  return typeof state === "string" && state.startsWith(WEB_STATE_PREFIX);
}

export function webOAuthCookieValue(connectorId: string, state: string): string {
  return `${connectorId}:${state}`;
}

/** The provider consent URL and the state to remember, or null when the server has no credentials for it. */
export function beginWebOAuth(connectorId: string): { url: string; state: string } | null {
  const provider = WEB_OAUTH_PROVIDERS[connectorId];
  const config = getConnectivityOAuthProviderConfig(connectorId);
  if (!provider || !config?.clientId || !config.clientSecret) return null;

  const state = `${WEB_STATE_PREFIX}${randomBytes(24).toString("hex")}`;
  const url = new URL(provider.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", provider.redirectUri);
  if (provider.scopes.length > 0) url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

export class WebOAuthError extends Error {
  constructor(readonly code: "not_configured" | "exchange_failed" | "store_failed") {
    super(code);
  }
}

/**
 * Exchanges the authorization code and stores the connection for `account`. The caller has already
 * verified the session, the state cookie and the entitlement.
 */
export async function completeWebOAuth(account: AccountContext, connectorId: string, code: string): Promise<void> {
  const provider = WEB_OAUTH_PROVIDERS[connectorId];
  const config = getConnectivityOAuthProviderConfig(connectorId);
  if (!provider || !config?.clientId || !config.clientSecret) throw new WebOAuthError("not_configured");

  const basicAuth = config.clientAuth === "basic";
  const params = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: provider.redirectUri });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (basicAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  } else {
    params.set("client_id", config.clientId);
    params.set("client_secret", config.clientSecret);
  }

  let tokens: Record<string, unknown>;
  try {
    const response = await fetch(config.tokenUrl, { method: "POST", headers, body: params });
    tokens = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new WebOAuthError("exchange_failed");
  } catch {
    throw new WebOAuthError("exchange_failed");
  }
  const accessToken = tokens.access_token;
  if (typeof accessToken !== "string" || !accessToken) throw new WebOAuthError("exchange_failed");
  const refreshToken = typeof tokens.refresh_token === "string" ? tokens.refresh_token : null;
  const expiresAt = typeof tokens.expires_in === "number" ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

  // Best-effort account name for the connection row; the connection is valid without it.
  let accountName: string | null = null;
  let username: string | null = null;
  try {
    const identity = await fetch(provider.identityUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (identity.ok) {
      const user = (await identity.json()) as { username?: string; nickname?: string; display_name?: string };
      username = user.username ?? user.nickname ?? null;
      accountName = user.display_name ?? username;
    }
  } catch {
    // leave the name empty
  }

  const stored = await account.supabase.rpc("store_connectivity_credential", {
    p_connector_id: connectorId,
    p_organization_id: null,
    p_auth_method: "oauth2",
    p_secret: accessToken,
    p_refresh_token: refreshToken,
    p_expires_at: expiresAt,
  });
  if (stored.error) throw new WebOAuthError("store_failed");

  const row = {
    user_id: account.user.id,
    organization_id: null,
    connector_id: connectorId,
    connection_id: `${connectorId}:${account.user.id}`,
    status: "connected",
    granted_permissions: provider.capabilities,
    last_sync_at: new Date().toISOString(),
    metadata: { accountName, username },
  };
  const existing = await account.supabase
    .from("connectivity_connections")
    .select("id")
    .eq("user_id", account.user.id)
    .eq("connector_id", connectorId)
    .is("organization_id", null)
    .maybeSingle();
  const written = existing.data
    ? await account.supabase.from("connectivity_connections").update(row).eq("id", (existing.data as { id: string }).id)
    : await account.supabase.from("connectivity_connections").insert(row);
  if (existing.error || written.error) throw new WebOAuthError("store_failed");
}
