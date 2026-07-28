import { getConnectivityOAuthProviderConfig } from "../../../../../lib/connectivityOAuthProviders";

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
 */
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

  const config = getConnectivityOAuthProviderConfig(connectorId);
  if (!config) return jsonError(`Unknown connector '${connectorId}'.`, 400);
  if (!config.clientId || !config.clientSecret) {
    return jsonError(`Connector '${connectorId}' is not configured on this server (missing client id/secret).`, 500);
  }

  const params = new URLSearchParams({ grant_type: grantType, client_id: config.clientId, client_secret: config.clientSecret });
  if (typeof body.code === "string") params.set("code", body.code);
  if (typeof body.redirect_uri === "string") params.set("redirect_uri", body.redirect_uri);
  if (typeof body.code_verifier === "string") params.set("code_verifier", body.code_verifier);
  if (typeof body.refresh_token === "string") params.set("refresh_token", body.refresh_token);

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
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
      scope: typeof payload.scope === "string" ? payload.scope : undefined,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Token exchange failed.", 502);
  }
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}
