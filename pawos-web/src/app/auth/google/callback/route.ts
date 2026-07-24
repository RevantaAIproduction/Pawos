import { relayToDesktop } from "../../../../lib/desktopRelay";

/**
 * Desktop-only relay — Google's OAuth app is registered with this hosted
 * URL as its "Authorized redirect URI" (see GoogleOAuthFlow.ts's
 * GOOGLE_REDIRECT_URI). PawOS's own web sign-in never lands here; it uses
 * Supabase's OAuth flow, landing at /auth/callback instead.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return relayToDesktop("google-auth-callback", searchParams.get("code"), searchParams.get("error"));
}
