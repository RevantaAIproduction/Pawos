import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { relayConnectivityToDesktop } from "../desktopRelay";
import { getAccountContext } from "./accountContext";
import { isIntegrationEntitled } from "./integrations";
import { WEB_OAUTH_STATE_COOKIE, WEB_OAUTH_STATE_COOKIE_PATH, completeWebOAuth, isWebOAuthState, webOAuthCookieValue } from "./webOAuth";

/** Same reasoning as auth/callback/route.ts: behind the reverse proxy, request.url's origin is not the public one. */
function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/**
 * One connector OAuth callback URL serves both apps:
 *  - a state not beginning "web." was started by the PawOS desktop app and is relayed to it,
 *    exactly as before;
 *  - a "web." state was started on PawOS Web and is completed here: the state must match the
 *    httpOnly cookie set when the flow began (CSRF), the request must carry a signed-in session,
 *    and the account must hold the connector's entitlement. The code is exchanged on the server and
 *    the tokens go straight into the shared, Vault-backed credential store. The browser is sent back
 *    to the Integrations page (or to `return`, an allowlisted in-app path) with a fixed status code
 *    — never a token.
 */
export async function handleConnectorCallback(request: Request, connectorId: string): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (!isWebOAuthState(state)) {
    return relayConnectivityToDesktop(code, providerError, state);
  }

  const origin = resolveOrigin(request);
  const finish = (status: "connected" | "denied" | "failed" | "expired" | "not_entitled" | "not_configured") => {
    const response = NextResponse.redirect(`${origin}/dashboard/integrations?integration=${connectorId}&status=${status}`);
    response.cookies.set(WEB_OAUTH_STATE_COOKIE, "", { path: WEB_OAUTH_STATE_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  // The state must be the one this browser was given when it started the flow (CSRF protection).
  const expected = (await cookies()).get(WEB_OAUTH_STATE_COOKIE)?.value;
  if (!expected || expected !== webOAuthCookieValue(connectorId, state)) return finish("expired");

  if (providerError) return finish("denied");
  if (!code) return finish("failed");

  const account = await getAccountContext();
  if (!account) {
    const response = NextResponse.redirect(`${origin}/login`);
    response.cookies.set(WEB_OAUTH_STATE_COOKIE, "", { path: WEB_OAUTH_STATE_COOKIE_PATH, maxAge: 0 });
    return response;
  }
  if (!isIntegrationEntitled(account, connectorId)) return finish("not_entitled");

  try {
    await completeWebOAuth(account, connectorId, code);
    return finish("connected");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    console.error(`[connectors/${connectorId}] web OAuth callback failed: ${reason}`);
    return finish(reason === "not_configured" ? "not_configured" : "failed");
  }
}
