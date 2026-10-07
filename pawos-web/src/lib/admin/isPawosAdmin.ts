import { createClient } from "@supabase/supabase-js";

/**
 * The one administrator check for pawos-web's /api/admin routes.
 *
 * It asks the database, as the signed-in caller, whether that account is a PawOS administrator
 * (pawos_is_build_admin — the same function behind every admin_* database function). Since
 * 20261007010000_security_seats_and_admin_identity.sql that function matches the caller's account
 * id against the bound administrator accounts, so the answer does not depend on an email address,
 * and there is no list of administrators in this codebase to keep in step.
 *
 * Fails closed: an unreadable answer (missing configuration, an error, an expired token) is "no".
 */
export async function isPawosAdmin(accessToken: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !accessToken) return false;
  try {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await client.rpc("pawos_is_build_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}
