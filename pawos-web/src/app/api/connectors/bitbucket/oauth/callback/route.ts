import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { relayConnectivityToDesktop } from "../../../../../../lib/desktopRelay";
import { getAccountContext } from "../../../../../../lib/account/accountContext";
import { isIntegrationEntitled } from "../../../../../../lib/account/integrations";
import { WEB_OAUTH_STATE_COOKIE, completeWebOAuth, isWebOAuthState, webOAuthCookieValue } from "../../../../../../lib/account/webOAuth";

const CONNECTOR_ID = "bitbucket";

/** Same reasoning as auth/callback/route.ts: behind the reverse proxy, request.url's origin is not the public one. */
function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/**
 * GET /api/connectors/bitbucket/oauth/callback — the redirect URL registered on PawOS's Bitbucket
 * Cloud OAuth consumer (https://pawos.revantaai.com/api/connectors/bitbucket/oauth/callback).
 * Bitbucket sends the browser here with `code` + `state`, or `error` + `error_description`.
 *
 * Two kinds of flow arrive at this one URL:
 *  - Started in the PawOS desktop app (any state not beginning "web."): relayed to the desktop's
 *    local listener, where OAuthManager exchanges the code through /api/connectivity/oauth/exchange
 *    and stores the tokens in the Credential Vault — identical to every other connector callback.
 *  - Started on PawOS Web (state "web.…"): completed here. The state must match the httpOnly
 *    cookie set when the flow began, the request must carry a signed-in session, and the account
 *    must hold the Bitbucket entitlement. The code is then exchanged at
 *    https://bitbucket.org/site/oauth2/access_token, the access and refresh tokens are stored in
 *    the same vault-backed credential store the desktop uses, and the browser is sent back to the
 *    Integrations page. Tokens never appear in a URL, a cookie or a response body.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (!isWebOAuthState(state)) {
    return relayConnectivityToDesktop(code, providerError, state);
  }

  const origin = resolveOrigin(request);
  const finish = (status: "connected" | "denied" | "failed" | "expired" | "not_entitled" | "not_configured") => {
    const response = NextResponse.redirect(`${origin}/dashboard/integrations?integration=${CONNECTOR_ID}&status=${status}`);
    response.cookies.set(WEB_OAUTH_STATE_COOKIE, "", { path: "/api/connectors", maxAge: 0 });
    return response;
  };

  // The state must be the one this browser was given when it started the flow (CSRF protection).
  const expected = (await cookies()).get(WEB_OAUTH_STATE_COOKIE)?.value;
  if (!expected || expected !== webOAuthCookieValue(CONNECTOR_ID, state)) return finish("expired");

  if (providerError) return finish("denied");
  if (!code) return finish("failed");

  const account = await getAccountContext();
  if (!account) {
    const response = NextResponse.redirect(`${origin}/login`);
    response.cookies.set(WEB_OAUTH_STATE_COOKIE, "", { path: "/api/connectors", maxAge: 0 });
    return response;
  }
  if (!isIntegrationEntitled(account, CONNECTOR_ID)) return finish("not_entitled");

  try {
    await completeWebOAuth(account, CONNECTOR_ID, code);
    return finish("connected");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.error(`[connectors/bitbucket] web OAuth callback failed: ${reason}`);
    return finish(reason === "not_configured" ? "not_configured" : "failed");
  }
}
