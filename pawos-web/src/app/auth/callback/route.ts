import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * Website-native OAuth/email-confirmation landing — completes the PKCE code
 * exchange for pawos-web's own signed-in session (Google/GitHub sign-in
 * started from /login or /signup, or a signup confirmation link) and sets
 * the session cookie via the server Supabase client. Not used by the
 * desktop app — see auth/google/callback and auth/github/callback for that.
 */

/**
 * `new URL(request.url).origin` isn't reliable behind this deployment's
 * nginx reverse proxy — it was observed resolving to the app's own local
 * bind address (http://localhost:3000) instead of the public domain, even
 * though nginx forwards the real Host header correctly (confirmed via
 * `proxy_set_header Host $host`). Reading the incoming Host header directly
 * (falling back to X-Forwarded-Host, standard for proxies that set it) sidesteps
 * whatever internal origin-resolution Next.js is doing and matches what nginx
 * actually sends.
 */
function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
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

  console.log('[OAuth Callback]', { code: code ? 'present' : 'missing', origin, next, error: errorDescription });

  if (errorDescription) {
    console.error('[OAuth Callback] Error from provider:', errorDescription);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    console.error('[OAuth Callback] Missing authorization code');
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[OAuth Callback] Code exchange failed:', error.message);
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }

    console.log('[OAuth Callback] Session created, redirecting to:', next);
    return NextResponse.redirect(`${origin}${next}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sign-in is temporarily unavailable.";
    console.error('[OAuth Callback] Exception:', message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }
}
