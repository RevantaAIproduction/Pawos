import { relayConnectivityToDesktop } from "../../../../../lib/desktopRelay";

/** Registered as this Vercel OAuth app's callback URL (CONNECTOR_VERCEL_CALLBACK_URL) — thin
 *  relay only, see relayConnectivityToDesktop's own doc comment for why no exchange happens here. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
