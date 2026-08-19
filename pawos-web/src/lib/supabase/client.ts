import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for pawos-web's own account/session pages
 * (login, signup, dashboard) — separate from the Electron app's Supabase
 * client, but pointed at the same project, so a signed-in web user sees the
 * same account and Supabase-backed data (e.g. task credits) the desktop app
 * already writes.
 *
 * `flowType` defaults to 'pkce' (matches every other caller: login, signup, OAuth via
 * /auth/callback, which all rely on exchangeCodeForSession). Password reset
 * (ForgotPasswordForm.tsx/ResetPasswordForm.tsx) is the one deliberate exception, passing
 * 'implicit' instead — PKCE stores a code_verifier secret in the *requesting* browser, which
 * genuinely isn't available if the emailed link is opened in a different browser/device (the
 * normal case for email — request the reset in the app, open Gmail somewhere else), producing a
 * real "PKCE code verifier not found in storage" failure. Implicit flow puts everything the link
 * needs directly in the URL itself, so it works from anywhere the link is opened.
 */
export function createClient(flowType: "pkce" | "implicit" = "pkce") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserClient(url, anonKey, { auth: { flowType } });
}
