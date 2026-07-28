import { relayConnectivityToDesktop } from "../../../../../lib/desktopRelay";

/**
 * GitHub-as-a-connector needs its own dedicated OAuth app + callback — the existing
 * GITHUB_CLIENT_ID/GITHUB_REDIRECT_URI pair is Supabase's own sign-in integration
 * (see ../../../auth/github/callback/route.ts) and its registered redirect URL is a Supabase
 * session-code relay, not a real GitHub authorization code suitable for connector use. This path
 * (https://pawos.revantaai.com/api/connectors/github/callback) is what CONNECTOR_GITHUB_CALLBACK_URL
 * should be set to, registered on a separate GitHub OAuth App (CONNECTOR_GITHUB_CLIENT_ID/SECRET).
 * Thin relay only, see relayConnectivityToDesktop's own doc comment for why no exchange happens here.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayConnectivityToDesktop(searchParams.get("code"), error, searchParams.get("state"));
}
