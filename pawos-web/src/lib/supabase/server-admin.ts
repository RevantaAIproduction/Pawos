import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service-role key.
 * Bypasses RLS policies — use only for backend API operations that require
 * elevated permissions (e.g., checking/recording legal acceptance before
 * account creation, admin operations).
 *
 * Never expose this client to the browser or use it for general user queries.
 */
export function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service-role key not configured — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
