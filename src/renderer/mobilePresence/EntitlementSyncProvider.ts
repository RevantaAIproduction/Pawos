import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../auth/supabaseClient';

/**
 * TEMPORARY BRIDGE — NOT THE PERMANENT ENTITLEMENT ARCHITECTURE.
 *
 * There is no backend/account/subscription service anywhere in PawOS today
 * (confirmed: pawos-web's own billing webhook route has no persistent
 * account database to write to, and CheckoutSyncServer.ts is a same-machine
 * loopback shortcut, not real cross-device sync). Because of that gap,
 * `begin_pairing_session()`'s server-side tier check
 * (supabase/migrations/20260730020000_mobile_presence_pairing_enforcement.sql)
 * has nothing authoritative to read except a table the client itself
 * populates — self-reported, not payment-verified.
 *
 * This is deliberately isolated to a single function in a single file so
 * that when a real subscription-backed entitlement system exists (a webhook
 * writing to a persistent account table, checked directly by Postgres), the
 * replacement is: delete this file, delete the `sync_my_entitlement_tier`
 * RPC, and change `begin_pairing_session()` to read the real table instead.
 * No other file may depend on anything in here beyond calling
 * `syncEntitlementTier()` before a pairing attempt — nothing else should
 * import `sync_my_entitlement_tier` directly, so this stays the only call
 * site that needs to change.
 *
 * The desktop client must never be treated as the permanent source of truth
 * for paid entitlements — this function exists only because, today, it is
 * briefly the *least-bad* available source, not because it is trustworthy
 * long-term. `begin_pairing_session()` still fails CLOSED (defaults to
 * 'go'/blocked) for any account that never called this or whose sync a
 * hostile client skipped — see that migration's own header comment for the
 * full threat-model discussion.
 */
export async function syncEntitlementTier(): Promise<void> {
  const snapshot = await ipc.entitlementGetSnapshot();
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc('sync_my_entitlement_tier', { p_tier: snapshot.tier });
  if (error) throw error;
}
