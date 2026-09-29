import { relayConnectivityToDesktop } from "../../../../../../lib/desktopRelay";

/**
 * Connector OAuth callback at https://pawos.revantaai.com/api/connectivity/oauth/callback/<provider>
 * — the callback URL some provider apps (e.g. GitHub, Slack) are registered with, matching the desktop's
 * CONNECTOR_*_CALLBACK_URL values. Same thin relay back to the desktop app as /api/connectors/<p>/callback:
 * forwards code/state to Electron's local listener, no exchange happens here (see relayConnectivityToDesktop).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
