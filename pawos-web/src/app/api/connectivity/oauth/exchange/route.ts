import { createClient } from "@supabase/supabase-js";
import { getConnectivityOAuthProviderConfig } from "../../../../../lib/connectivityOAuthProviders";
import { isPawosRedirectUri } from "../../../../../lib/connectivityOAuthRedirects";

/**
 * The one place any Connectivity Runtime connector's OAuth client_secret is ever used — Electron's
 * OAuthManager (src/main/connectivity/OAuthManager.ts) POSTs here instead of a provider's token
 * endpoint directly, exactly mirroring how PawOS's own Google/GitHub sign-in already keeps its
 * client_secret server-side (see ../../../../auth/google/callback/route.ts and
 * pawos-web/src/lib/desktopRelay.ts). The desktop app never sees a client_secret for any provider.
 *
 * Body: { connectorId, grant_type: 'authorization_code' | 'refresh_token', code?, redirect_uri?,
 * code_verifier?, refresh_token? } — the exact param set OAuthManager.exchangeCodeForToken /
 * refreshAccessToken already build today, just relayed here instead of sent to the provider.
 *
 * This is not a general proxy to a provider's token endpoint. Only the two grants the apps use are
 * accepted, each with exactly the fields it needs, and an authorization code can only be redeemed
 * for one of PawOS's own redirect addresses. Anything else (client_credentials, password, a
 * device or JWT grant, a foreign redirect) is refused before any request carrying a client secret
 * is made.
 *
 * Sign-in: PawOS Desktop 1.0.2 and earlier call this without a session, so one is not required
 * yet — requiring it today would break connecting any service from the shipped app. From 1.0.3 the
 * desktop app sends its PawOS session (Authorization: Bearer); when a request carries one it must
 * be valid, or the request is refused. PLANNED: once 1.0.2 is retired, set
 * CONNECTIVITY_EXCHANGE_REQUIRE_SESSION=true to refuse requests without a session. No code change
 * is needed for that switch.
 */
const MAX_FIELD_LENGTH = 4096;

/** A request field: the string, undefined when absent, or null when present but not a usable string. */
function field(body: Record<string, unknown>, name: string): string | null | undefined {
  const value = body[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_FIELD_LENGTH) return null;
  return value;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }

  const connectorId = typeof body.connectorId === "string" ? body.connectorId : null;
  const grantType = typeof body.grant_type === "string" ? body.grant_type : null;
  if (!connectorId || !grantType) {
    return jsonError("connectorId and grant_type are required.", 400);
  }

  const code = field(body, "code");
  const redirectUri = field(body, "redirect_uri");
  const codeVerifier = field(body, "code_verifier");
  const refreshToken = field(body, "refresh_token");
  if (code === null || redirectUri === null || codeVerifier === null || refreshToken === null) {
    return jsonError("Invalid request.", 400);
  }
  if (grantType === "authorization_code") {
    if (!code || !redirectUri || refreshToken !== undefined) return jsonError("Invalid request.", 400);
    if (!isPawosRedirectUri(connectorId, redirectUri)) return jsonError("That redirect address isn't one of PawOS's.", 400);
  } else if (grantType === "refresh_token") {
    if (!refreshToken || code !== undefined || redirectUri !== undefined || codeVerifier !== undefined) return jsonError("Invalid request.", 400);
  } else {
    return jsonError("Unsupported grant type.", 400);
  }

  const session = await checkSession(request);
  if (session === "invalid") return jsonError("Your PawOS session has expired. Sign in again.", 401);
  if (session === "absent" && process.env.CONNECTIVITY_EXCHANGE_REQUIRE_SESSION === "true") {
    return jsonError("Sign in to PawOS to connect this service.", 401);
  }

  const config = getConnectivityOAuthProviderConfig(connectorId);
  if (!config) return jsonError(`Unknown connector '${connectorId}'.`, 400);
  if (!config.clientId || !config.clientSecret) {
    return jsonError(`Connector '${connectorId}' is not configured on this server (missing client id/secret).`, 500);
  }

  const basicAuth = config.clientAuth === 'basic';
  const params = new URLSearchParams(basicAuth ? { grant_type: grantType } : { grant_type: grantType, client_id: config.clientId, client_secret: config.clientSecret });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (basicAuth) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
  if (code) params.set("code", code);
  if (redirectUri) params.set("redirect_uri", redirectUri);
  if (codeVerifier) params.set("code_verifier", codeVerifier);
  if (refreshToken) params.set("refresh_token", refreshToken);

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers,
      body: params,
    });
    const payload = (await tokenResponse.json().catch(() => ({}))) as Record<string, unknown>;

    // Slack's oauth.v2.access always answers HTTP 200 and signals failure via `ok: false` instead
    // of a non-2xx status — every other provider here uses a normal HTTP error code.
    if (connectorId === "slack" && payload.ok === false) {
      return jsonError(typeof payload.error === "string" ? payload.error : "Slack OAuth exchange failed.", 400);
    }
    if (!tokenResponse.ok) {
      const message =
        typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : `Token endpoint returned HTTP ${tokenResponse.status}.`;
      return jsonError(message, 400);
    }

    const accessToken = payload.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      return jsonError("Token endpoint response did not include access_token.", 502);
    }
    return Response.json({
      access_token: accessToken,
      refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
      expires_in: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
      // Bitbucket names this field `scopes`.
      scope: typeof payload.scope === "string" ? payload.scope : typeof payload.scopes === "string" ? payload.scopes : undefined,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Token exchange failed.", 502);
  }
}

/** Whether the request carries a PawOS session, and if it does, whether Supabase accepts it. */
async function checkSession(request: Request): Promise<"valid" | "invalid" | "absent"> {
  const header = request.headers.get("authorization");
  if (!header) return "absent";
  const token = /^Bearer (.+)$/i.exec(header)?.[1]?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return "invalid";
  try {
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await client.auth.getUser(token);
    return !error && data.user ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}
