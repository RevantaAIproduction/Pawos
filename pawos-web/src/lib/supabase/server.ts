import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components and Route Handlers —
 * reads/writes the session via cookies so a signed-in session persists
 * across page loads without any client-side token handling. Must be
 * created fresh per request (cookies() is request-scoped).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render (not a Route Handler /
          // Server Function) — cookies() can't write there. proxy.ts
          // refreshes the session cookie on every request, so this is
          // safe to ignore (matches the standard @supabase/ssr pattern).
        }
      },
    },
  });
}

/**
 * Server-side Supabase client for a request that authenticates with a Supabase access token in
 * `Authorization: Bearer <token>` instead of the session cookie (a non-browser client of the same
 * account, such as an editor extension). Every database call it makes carries that token, so
 * row-level security sees the token's own user — exactly as it does for the cookie client. Only
 * the public anon key is used; the token is held for this request only: nothing is persisted,
 * refreshed or written to a cookie. Whoever creates it must still verify the token
 * (`auth.getUser(token)`) before trusting it.
 */
export function createBearerClient(accessToken: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase isn't configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
