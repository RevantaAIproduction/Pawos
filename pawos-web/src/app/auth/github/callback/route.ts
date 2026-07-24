import { relayToDesktop } from "../../../../lib/desktopRelay";

const DESKTOP_GITHUB_RELAY_PORT = 51898;

/**
 * Desktop-only relay — this is the GITHUB_REDIRECT_URI Electron's renderer
 * passes as `redirectTo` to supabase.auth.signInWithOAuth(), so it's what
 * Supabase's project "Redirect URLs" allowlist must contain and what
 * Supabase itself redirects the browser to after completing the GitHub
 * exchange (see GitHubOAuthFlow.ts). PawOS's own web sign-in never lands
 * here; it uses redirectTo: '/auth/callback' instead.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error_description") ?? searchParams.get("error");
  return relayToDesktop(DESKTOP_GITHUB_RELAY_PORT, searchParams.get("code"), error);
}
