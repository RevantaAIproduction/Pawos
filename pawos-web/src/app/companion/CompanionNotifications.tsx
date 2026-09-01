"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Status = "unsupported" | "unpaired" | "idle" | "subscribing" | "subscribed" | "error";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/**
 * Notification Runtime (MOB-7) — the PWA's push-subscription flow. Requires
 * a real Notification permission grant and a real PushManager subscription;
 * saves the resulting endpoint/keys to device_push_subscriptions so the
 * desktop's Notification Runtime (see NotificationRuntime.ts) can send to it.
 * Only shown once this browser has actually completed pairing (a real
 * trusted_devices.id in localStorage) — an unpaired session has nothing to
 * attach a subscription to.
 */
export function CompanionNotifications() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      if (isMounted) setStatus("unsupported");
      return;
    }
    if (!window.localStorage.getItem("pawos_paired_device_id")) {
      if (isMounted) setStatus("unpaired");
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => {
        if (isMounted) setStatus(existing ? "subscribed" : "idle");
      })
      .catch(() => {
        if (isMounted) setStatus("idle");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const enable = async () => {
    const deviceId = window.localStorage.getItem("pawos_paired_device_id");
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!deviceId) {
      setStatus("unpaired");
      return;
    }
    if (!vapidPublicKey) {
      setStatus("error");
      setError("Push notifications are not configured yet.");
      return;
    }

    setStatus("subscribing");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("idle");
        setError("Notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Browser returned an incomplete push subscription.");
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const { error: insertError } = await supabase.from("device_push_subscriptions").insert({
        device_id: deviceId,
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      });
      if (insertError) throw insertError;

      setStatus("subscribed");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (status === "unsupported" || status === "unpaired") return null;

  return (
    <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
      <h2 className="font-semibold">Notifications</h2>
      {status === "subscribed" ? (
        <p className="mt-2 text-sm text-emerald-400">Notifications are enabled on this device.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutral-400">
            Get notified here when a task finishes, PawOS needs your approval, or something needs your
            attention on your desktop.
          </p>
          <button
            type="button"
            onClick={enable}
            disabled={status === "subscribing"}
            className="mt-4 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900 disabled:opacity-50"
          >
            {status === "subscribing" ? "Enabling…" : "Enable notifications"}
          </button>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
