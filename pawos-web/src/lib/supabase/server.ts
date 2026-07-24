import { createServerClient } from "@supabase/ssr";
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
