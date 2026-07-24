import { getSupabaseClient } from '../auth/supabaseClient';
import type { DeviceSessionRecord, LocalDeviceIdentity } from '../../shared/device/DeviceTypes';

type DeviceSessionRow = {
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

function toRecord(row: DeviceSessionRow): DeviceSessionRecord {
  return {
    deviceId: row.device_id,
    deviceName: row.device_name,
    platform: row.platform,
    appVersion: row.app_version,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Queries/mutates Supabase directly from the renderer, following the exact
 * pattern OrganizationService.ts already uses (getSupabaseClient()) — no
 * main-process IPC needed since the list of a user's devices is inherently
 * cloud-backed, like auth: a session created on one device must be visible
 * from another.
 */
export const deviceSessionsService = {
  async upsertThisDevice(identity: LocalDeviceIdentity, appVersion: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return; // no session yet (guest) — nothing to upsert

    const { error } = await supabase.from('device_sessions').upsert(
      {
        user_id: userData.user.id,
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        platform: identity.platform,
        app_version: appVersion,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,device_id' }
    );
    if (error) throw error;
  },

  async listMySessions(): Promise<DeviceSessionRecord[]> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('device_sessions')
      .select('*')
      .is('revoked_at', null)
      .order('last_seen_at', { ascending: false })
      .returns<DeviceSessionRow[]>();
    if (error) throw error;
    return (data ?? []).map(toRecord);
  },

  async revoke(deviceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('device_id', deviceId);
    if (error) throw error;
  },

  /**
   * Revokes every other device's session server-side via Supabase Auth's
   * own `scope: 'others'` sign-out (real, built into the installed SDK —
   * see GoTrueClient.d.ts) — no separate revocation backend needed. Also
   * best-effort marks the other rows revoked here so the list reflects it
   * immediately instead of waiting for those devices to notice.
   */
  async signOutOtherDevices(thisDeviceId: string): Promise<void> {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw error;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase
      .from('device_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userData.user.id)
      .neq('device_id', thisDeviceId);
  },
};
