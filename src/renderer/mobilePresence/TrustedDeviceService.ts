import { getSupabaseClient } from '../auth/supabaseClient';
import { DEFAULT_DEVICE_CAPABILITIES } from '../../shared/mobilePresence/MobilePresenceTypes';
import type { DeviceCapabilities, TrustedDevice } from '../../shared/mobilePresence/MobilePresenceTypes';

type TrustedDeviceRow = {
  id: string;
  user_id: string;
  name: string;
  device_type: string;
  platform: string | null;
  browser: string | null;
  capabilities: Partial<DeviceCapabilities> | null;
  status: 'active' | 'revoked';
  paired_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

function toTrustedDevice(row: TrustedDeviceRow): TrustedDevice {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    deviceType: row.device_type,
    platform: row.platform,
    browser: row.browser,
    capabilities: { ...DEFAULT_DEVICE_CAPABILITIES, ...(row.capabilities ?? {}) },
    status: row.status,
    pairedAt: row.paired_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Trusted Device Runtime — the Mobile Presence architecture's device
 * registry. Direct-Supabase pattern matching CredentialVaultService.ts:
 * plain RLS-gated reads/updates for non-sensitive operations, a
 * security-definer RPC only where server-side side effects are required
 * (revoke also has to delete push subscriptions, so a plain client update
 * isn't enough there).
 *
 * This service owns device state only — pairing (how a device gets added
 * here in the first place) is the Pairing Runtime's job, not this file's.
 * See supabase/migrations/20260730000000_mobile_presence_phase1.sql for the
 * schema, and src/shared/mobilePresence/MobilePresenceTypes.ts for the
 * shared shapes. Replaces src/main/pairing/PlatformPairingStore.ts and
 * src/main/communication/MobilePairingStore.ts (both local-Electron-JSON,
 * unreachable from a real phone client) — those are removed only once every
 * caller has migrated and MOB-11 confirms zero remaining references.
 */
export const trustedDeviceService = {
  /** Every device this account has ever paired, active and revoked alike — callers filter as needed (see PairedDevicesPanel's activeDevices/revokedDevices split). */
  async list(): Promise<TrustedDevice[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('trusted_devices')
      .select('id, user_id, name, device_type, platform, browser, capabilities, status, paired_at, last_seen_at, revoked_at')
      .order('paired_at', { ascending: false })
      .returns<TrustedDeviceRow[]>();
    if (error) throw error;
    return (data ?? []).map(toTrustedDevice);
  },

  /** Plain RLS-gated update — trusted_devices_own_update already restricts this to the caller's own devices, no RPC needed for a simple rename. */
  async rename(deviceId: string, name: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('trusted_devices').update({ name }).eq('id', deviceId);
    if (error) throw error;
  },

  /** Heartbeat — called periodically by an active client session (desktop or PWA) so `lastSeenAt` reflects real presence rather than being a write-once field, unlike the legacy stores this replaces. */
  async touchLastSeen(deviceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.from('trusted_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);
    if (error) throw error;
  },

  /** Revokes trust AND deletes the device's push subscriptions server-side (revoke_trusted_device RPC) — unlike the legacy stores' revoke(), this has a real, live effect: no further notification can ever reach a revoked device again. */
  async revoke(deviceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.rpc('revoke_trusted_device', { p_device_id: deviceId });
    if (error) throw error;
  },
};
