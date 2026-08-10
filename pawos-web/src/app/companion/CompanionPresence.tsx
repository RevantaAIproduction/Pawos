"use client";

import { useEffect } from "react";
import { createClient } from "../../lib/supabase/client";
import { CrossDevicePresenceSession } from "../../lib/mobilePresence/crossDevicePresenceSession";
import { detectDeviceName, detectPlatform, detectBrowser } from "../../lib/mobilePresence/deviceDetection";

/**
 * Cross Device Runtime (MOB-6) — joins live presence only once this browser has actually
 * completed pairing (a real `trusted_devices.id` in localStorage from PairClient.tsx). Before
 * that, /companion stays exactly the honest static shell it was in MOB-4 — no fabricated "online"
 * state for a device the account hasn't trusted yet.
 */
export function CompanionPresence({ userId }: { userId: string }) {
  useEffect(() => {
    const deviceId = window.localStorage.getItem("pawos_paired_device_id");
    if (!deviceId) return;

    const session = new CrossDevicePresenceSession();
    const supabase = createClient();
    session.join(supabase, userId, {
      deviceId,
      deviceType: "pwa",
      deviceName: `${detectDeviceName()} (${detectBrowser()} on ${detectPlatform()})`,
    });

    return () => {
      session.leave();
    };
  }, [userId]);

  return null;
}
