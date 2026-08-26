import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

  console.log('[OAuth Callback] Request received', {
    code: code ? 'present' : 'missing',
    origin,
    next,
    error: errorDescription,
    url: request.url,
  });

  if (errorDescription) {
    console.error('[OAuth Callback] Provider error:', errorDescription);
    const errorUrl = `${origin}/login?error=${encodeURIComponent(errorDescription)}`;
    console.log('[OAuth Callback] Redirecting to:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  if (!code) {
    console.error('[OAuth Callback] Missing authorization code');
    const errorUrl = `${origin}/login?error=${encodeURIComponent("Missing authorization code.")}`;
    console.log('[OAuth Callback] Redirecting to:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }

  try {
    console.log('[OAuth Callback] Creating Supabase client...');
    const supabase = await createClient();

    console.log('[OAuth Callback] Exchanging code for session...');
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[OAuth Callback] Code exchange failed:', {
        message: error.message,
        status: error.status,
        code: error.code,
      });
      const errorUrl = `${origin}/login?error=${encodeURIComponent(`Auth failed: ${error.message}`)}`;
      console.log('[OAuth Callback] Redirecting to:', errorUrl);
      return NextResponse.redirect(errorUrl);
    }

    console.log('[OAuth Callback] Session created successfully', {
      userId: data.session?.user?.id,
      email: data.session?.user?.email,
      provider: data.session?.user?.app_metadata?.provider,
    });

    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const sessionCookies = allCookies.filter(c => c.name.includes('sb-') || c.name.includes('auth'));
    console.log('[OAuth Callback] Cookies set after exchange:', {
      total: allCookies.length,
      sessionCookies: sessionCookies.map(c => ({ name: c.name, valueLength: c.value.length })),
    });

    const redirectUrl = `${origin}${next}`;
    console.log('[OAuth Callback] Redirecting to dashboard:', redirectUrl);
    return NextResponse.redirect(redirectUrl);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sign-in is temporarily unavailable.";
    console.error('[OAuth Callback] Exception:', {
      message,
      stack: e instanceof Error ? e.stack : 'unknown',
    });
    const errorUrl = `${origin}/login?error=${encodeURIComponent(message)}`;
    console.log('[OAuth Callback] Redirecting to:', errorUrl);
    return NextResponse.redirect(errorUrl);
  }
}
