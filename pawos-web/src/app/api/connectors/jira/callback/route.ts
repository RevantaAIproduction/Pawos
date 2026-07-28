import { relayConnectivityToDesktop } from "../../../../../lib/desktopRelay";

/** Registered as this Atlassian OAuth app's callback URL (CONNECTOR_JIRA_CALLBACK_URL) — thin
 *  relay only, see relayConnectivityToDesktop's own doc comment for why no exchange happens here. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
