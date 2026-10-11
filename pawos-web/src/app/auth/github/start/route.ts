import { NextResponse } from "next/server";
import { trustedOrigin } from "../../../../lib/siteOrigin";
import { createClient } from "../../../../lib/supabase/server";

/**
 * GET /auth/github/start — a fixed public link that begins GitHub sign-in, for places that can
 * only hold a URL (the GitHub Marketplace listing's Installation URL). It is the same flow as the
 * "Continue with GitHub" button on /login (startOAuth in login/AuthPieces.tsx), started on the
 * server instead of in the browser:
 *
 *   here → Supabase /auth/v1/authorize → GitHub → Supabase /auth/v1/callback → /auth/callback
 *
 * Supabase stays the OAuth client; nothing here talks to GitHub or holds a GitHub secret. The
 * server Supabase client generates the PKCE pair and keeps the verifier in this browser's cookies
 * (the same cookie the /login flow uses), so /auth/callback completes the exchange unchanged. The
 * link works for a signed-out browser and needs no existing PawOS session.
 *
 * Not used by the desktop app — see ../callback/route.ts for its relay.
 */

export async function GET(request: Request) {
  // The site's own configured address — never the request's Host or X-Forwarded-Host, which the
  // caller chooses. This is what Supabase is told to send the browser back to.
  const origin = trustedOrigin(request);
  const failed = (message: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      // The redirect the /login flow already uses, so it is already in Supabase's allowed list.
      options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true },
    });
    if (error || !data.url) {
      console.error("[auth/github/start] Could not start GitHub sign-in:", error?.message ?? "no authorize URL");
      return failed("Could not start GitHub sign-in. Please try again.");
    }
    return NextResponse.redirect(data.url);
  } catch (e) {
    console.error("[auth/github/start] Exception:", e instanceof Error ? e.message : e);
    return failed("Sign-in is temporarily unavailable.");
  }
}
