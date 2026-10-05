import { handleConnectorCallback } from "../../../../../lib/account/webOAuthCallback";

/**
 * GET /api/connectors/github/callback — kept as an alias. The GitHub connector OAuth App
 * (CONNECTOR_GITHUB_CLIENT_ID/SECRET) is registered with /api/connectivity/oauth/callback/github
 * (CONNECTOR_GITHUB_CALLBACK_URL), which is what Desktop and Web send. That app is deliberately separate from
 * GITHUB_CLIENT_ID/GITHUB_REDIRECT_URI, which is Supabase's own sign-in integration (see
 * ../../../auth/github/callback/route.ts).
 *
 * Two kinds of flow arrive here (see handleConnectorCallback):
 *  - Started in the PawOS desktop app: relayed to the desktop app unchanged
 *    (relayConnectivityToDesktop) — the desktop exchanges the code itself.
 *  - Started on PawOS Web (state "web.…", e.g. from a phone): completed on the server; the tokens
 *    go into the same vault-backed credential store the desktop app uses, never to the browser.
 */
export async function GET(request: Request) {
  return handleConnectorCallback(request, "github");
}
