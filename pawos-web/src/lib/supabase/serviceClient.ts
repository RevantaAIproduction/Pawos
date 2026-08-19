import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely. Only ever used server-side, by routes that
 * genuinely need to act across every user's row rather than just the caller's own (the waitlist
 * broadcast route, and the Ticket Balance crediting path in ticketBalanceCrediting.ts, which calls
 * the service-role-only add_ticket_balance_service() RPC only after independently verifying a real
 * Razorpay payment — never on a bare client request). Never import this into anything a browser
 * request can reach without its own separate authorization check.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service role isn't configured — set SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
