import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { DevicePresenceMember } from '../../shared/mobilePresence/MobilePresenceTypes';

/**
 * Cross Device Runtime — live presence (MOB-6). Supabase Realtime Presence on a channel keyed by
 * account id, one entry per connected device (keyed by `trusted_devices.id`, not `user_id`, so
 * multiple devices on the same account each get their own entry) — mirrors the exact pattern
 * WorkspacePresenceSession.ts already established for org-workspace presence: ephemeral, nothing
 * persisted to a table, channel name is the account's own id (only ever handed to that account via
 * existing RLS elsewhere, so it functions as a shared secret the same way).
 *
 * The desktop app and the pawos-web PWA both join this same channel (pawos-web has its own copy at
 * pawos-web/src/lib/mobilePresence/crossDevicePresenceSession.ts, since the two bundles can't share
 * a module, but the shape and channel-naming convention are identical) — this is what lets the
 * desktop's Paired Devices panel show a live "online now" badge without polling.
 */
export class CrossDevicePresenceSession {
  private channel: RealtimeChannel | null = null;

  async join(
    userId: string,
    self: { deviceId: string; deviceType: string; deviceName: string },
    onPresenceChange: (devices: DevicePresenceMember[]) => void
  ): Promise<void> {
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`cross-device-presence:${userId}`, {
      config: { presence: { key: self.deviceId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ deviceType: string; deviceName: string; lastSeenAt: string }>();
      const devices: DevicePresenceMember[] = Object.entries(state).map(([deviceId, entries]) => ({
        deviceId,
        deviceType: entries[0]?.deviceType ?? 'unknown',
        deviceName: entries[0]?.deviceName ?? deviceId,
        lastSeenAt: entries[0]?.lastSeenAt ?? new Date().toISOString(),
      }));
      onPresenceChange(devices);
    });

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel
            .track({ deviceType: self.deviceType, deviceName: self.deviceName, lastSeenAt: new Date().toISOString() })
            .then(() => resolve());
        }
      });
    });

    this.channel = channel;
  }

  async leave(): Promise<void> {
    if (!this.channel) return;
    await this.channel.untrack();
    await this.channel.unsubscribe();
    this.channel = null;
  }
}
