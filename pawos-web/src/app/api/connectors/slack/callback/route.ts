import { relayConnectivityToDesktop } from "../../../../../lib/desktopRelay";

/**
 * Slack has no pre-registered connector callback URL (unlike every other provider here) — this
 * path (https://pawos.revantaai.com/api/connectors/slack/callback) is what CONNECTOR_SLACK_CALLBACK_URL
 * should be set to, and it must also be added as a Redirect URL in the Slack app's OAuth & Permissions
 * settings before Slack will accept it. Thin relay only, see relayConnectivityToDesktop's own doc
 * comment for why no exchange happens here.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
