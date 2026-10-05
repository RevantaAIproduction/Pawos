import { relayConnectivityToDesktop } from "../../../../../../lib/desktopRelay";
import { handleConnectorCallback } from "../../../../../../lib/account/webOAuthCallback";
import { isWebOAuthState, supportsWebOAuth } from "../../../../../../lib/account/webOAuth";

/**
 * Legacy connector OAuth callback at https://pawos.revantaai.com/api/connectivity/oauth/callback/<provider>.
 * Every connector now uses /api/connectors/<provider>/callback; this path is kept only for PawOS
 * Desktop versions installed before the move (they still send it for GitHub and Slack).
 *
 *  - Started in the PawOS desktop app: the same thin relay back to the desktop app as
 *    /api/connectors/<p>/callback — forwards code/state to Electron's local listener, no exchange
 *    happens here (see relayConnectivityToDesktop).
 *  - Started on PawOS Web (state "web.…", for a connector PawOS Web can connect, e.g. GitHub):
 *    completed on the server by handleConnectorCallback — tokens go into the same vault-backed
 *    credential store the desktop app uses, never to the browser.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const { searchParams } = new URL(request.url);
  if (isWebOAuthState(searchParams.get("state")) && supportsWebOAuth(provider)) {
    return handleConnectorCallback(request, provider);
  }
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
