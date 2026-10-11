import { NextResponse } from "next/server";
import { trustedOrigin } from "../../../lib/siteOrigin";
import { createClient } from "../../../lib/supabase/server";

/**
 * Website-native OAuth/email-confirmation landing — completes the PKCE code
 * exchange for pawos-web's own signed-in session (Google/GitHub sign-in
 * started from /login or /signup, or a signup confirmation link) and sets
 * the session cookie via the server Supabase client. Not used by the
 * desktop app — see auth/google/callback and auth/github/callback for that.
 *
 * Logging: failures only, by message. Never the request URL (it carries the one-time code), the
 * account's email or id, or anything about the session cookies.
 */

/**
 * Where this route's redirects point. `new URL(request.url).origin` isn't reliable behind this
 * deployment's nginx reverse proxy (it resolves to the app's local bind address), and the Host and
 * X-Forwarded-Host headers are chosen by whoever sends the request — so neither is used.
 */
function resolveOrigin(request: Request): string {
  // The site's own configured address (lib/siteOrigin.ts). It was once read from the Host and
  // X-Forwarded-Host headers, which the caller chooses: that let a request decide where this
  // route's redirects pointed.
  return trustedOrigin(request);
}

/**
 * Only ever a same-origin relative path (e.g. "/reset-password") — never trusts an absolute or
 * protocol-relative URL from the query string, which would otherwise turn this into an open
 * redirect. Falls back to the original /dashboard destination for every existing caller
 * (login/signup/OAuth) that doesn't pass `next` at all.
 */
function resolveNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = searchParams.get("code");
  const next = resolveNextPath(searchParams.get("next"));
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

  if (errorDescription) {
    console.error('[OAuth Callback] Provider error:', errorDescription);
    const errorUrl = `${origin}/login?error=${encodeURIComponent(errorDescription)}`;
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    console.error('[OAuth Callback] Missing authorization code');
    const errorUrl = `${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`;
    return NextResponse.redirect(errorUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[OAuth Callback] Code exchange failed:', {
        message: error.message,
        status: error.status,
        code: error.code,
      });
      const errorUrl = `${origin}/login?error=${encodeURIComponent(`Auth failed: ${error.message}`)}`;
      return NextResponse.redirect(errorUrl);
    }

    const redirectUrl = `${origin}${next}`;
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sign-in is temporarily unavailable.";
    console.error('[OAuth Callback] Exception:', message);
    const errorUrl = `${origin}/login?error=${encodeURIComponent(message)}`;
    return NextResponse.redirect(errorUrl);
  }
}
