import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for pawos-web's own account/session pages
 * (login, signup, dashboard) — separate from the Electron app's Supabase
 * client, but pointed at the same project, so a signed-in web user sees the
 * same account and Supabase-backed data (e.g. task credits) the desktop app
 * already writes.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createBrowserClient(url, anonKey);
}
