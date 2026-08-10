import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type DevicePresenceMember = {
  deviceId: string;
  deviceType: string;
  deviceName: string;
  lastSeenAt: string;
};

/**
 * Cross Device Runtime — live presence (MOB-6), pawos-web's side of the same channel the Electron
 * app's CrossDevicePresenceSession joins (src/renderer/mobilePresence/CrossDevicePresenceSession.ts)
 * — identical shape and channel-naming convention, duplicated rather than shared because the two
 * bundles (Electron renderer, Next.js) can't import each other's modules. Presence is keyed by
 * `trusted_devices.id`, so this should only ever be joined with the device id this browser received
 * back from `complete_pairing_session` — an unpaired session has no such id and must not join.
 */
export class CrossDevicePresenceSession {
  private channel: RealtimeChannel | null = null;

  async join(
    supabase: SupabaseClient,
    userId: string,
    self: { deviceId: string; deviceType: string; deviceName: string }
  ): Promise<void> {
    const channel = supabase.channel(`cross-device-presence:${userId}`, {
      config: { presence: { key: self.deviceId } },
    });

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
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
