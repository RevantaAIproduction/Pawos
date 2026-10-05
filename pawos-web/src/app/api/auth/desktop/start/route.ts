import { NextResponse } from "next/server";
import { rejectCrossOrigin } from "../../../../../lib/account/api";
import { createClient } from "../../../../../lib/supabase/server";
import { createServiceClient } from "../../../../../lib/supabase/serviceClient";
import { DESKTOP_SIGN_IN_PROTOCOL_URL, desktopSignInPath, isValidChallenge, stashDesktopSignIn } from "../../../../../lib/desktopSignIn";

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

/**
 * POST /api/auth/desktop/start — the signed-in person confirmed "Continue to PawOS Desktop" on
 * /auth/desktop. Mints a one-time sign-in token for their own account, binds it to the app's
 * challenge, and hands only a short code to the app through the pawos:// link (lib/desktopSignIn.ts).
 * The code is never put in the address bar: the answer is a small page that opens the app.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const origin = resolveOrigin(request);
  const form = await request.formData().catch(() => null);
  const challenge = form?.get("challenge");
  if (!isValidChallenge(challenge)) return NextResponse.redirect(`${origin}/auth/desktop`, 303);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(desktopSignInPath(challenge))}`, 303);
  if (!user.email) return page("This account has no email address, so it can't be used to sign in to PawOS Desktop from the browser. Sign in in the app instead.", null);

  const { data, error } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash || data.user?.id !== user.id) {
    console.error("[desktop-sign-in] could not create a sign-in token:", error?.code ?? "no token");
    return page("PawOS Desktop couldn't be signed in just now. Go back to the app and try again.", null);
  }

  const code = stashDesktopSignIn({ tokenHash, email: user.email, challenge });
  return page(null, `${DESKTOP_SIGN_IN_PROTOCOL_URL}?code=${encodeURIComponent(code)}`);
}

function page(error: string | null, deepLink: string | null): Response {
  const title = error ? "Couldn't sign in to PawOS Desktop" : "Opening PawOS Desktop…";
  const body = error
    ? `<p class="muted">${escapeHtml(error)}</p>`
    : `<p class="muted">You&rsquo;re signed in. If PawOS Desktop doesn&rsquo;t open, use the button below. You can close this tab afterwards.</p>
       <a class="button" href="${escapeHtml(deepLink ?? "")}">Open PawOS Desktop</a>
       <script>window.location.href = ${JSON.stringify(deepLink)};</script>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; color: #f5f5f5; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 440px; padding: 0 16px; }
  h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
  .muted { color: #a3a3a3; font-size: 14px; margin: 12px 0 24px; }
  .button { display: flex; height: 44px; align-items: center; justify-content: center; border-radius: 8px; background: #262626; color: #fff; font-weight: 600; font-size: 14px; text-decoration: none; }
  .button:hover { background: #404040; }
</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status: error ? 500 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
