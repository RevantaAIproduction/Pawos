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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = searchParams.get("code");
  const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

  if (errorDescription) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }

    return NextResponse.redirect(`${origin}/dashboard`);
  } catch (e) {
    // A misconfigured deployment (e.g. NEXT_PUBLIC_SUPABASE_URL missing on
    // this host) must never surface as a raw 502 — redirect to a real,
    // actionable error page instead of crashing the route handler.
    const message = e instanceof Error ? e.message : "Sign-in is temporarily unavailable.";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }
}
