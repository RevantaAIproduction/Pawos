import { relayGoogleToDesktop } from "../../../../lib/desktopRelay";

/**
 * Desktop-only relay — Google's OAuth app is registered with this hosted
 * URL as its "Authorized redirect URI" (see GoogleOAuthFlow.ts's
 * GOOGLE_REDIRECT_URI). PawOS's own web sign-in never lands here; it uses
 * Supabase's OAuth flow, landing at /auth/callback instead.
 *
 * relayGoogleToDesktop does the code-for-token exchange right here
 * server-side (this server holds GOOGLE_CLIENT_SECRET in its own
 * environment) before handing the desktop app the finished result — the
 * installer never needs that secret at all.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return relayGoogleToDesktop(searchParams.get("code"), searchParams.get("error"));
}
