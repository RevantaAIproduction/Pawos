"use client";

import { useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { detectDeviceName, detectPlatform, detectBrowser, detectCapabilities } from "../../../lib/mobilePresence/deviceDetection";

type PairStatus = "idle" | "pairing" | "success" | "error";

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function PairClient({ token, userEmail }: { token: string; userEmail: string | null }) {
  const [status, setStatus] = useState<PairStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const completePairing = async () => {
    setStatus("pairing");
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("complete_pairing_session", {
        p_token: token,
        p_device_name: detectDeviceName(),
        p_device_type: "pwa",
        p_platform: detectPlatform(),
        p_browser: detectBrowser(),
        p_capabilities: detectCapabilities(),
      });
      if (rpcError) throw rpcError;
      // Cross Device Runtime (MOB-6): persist the real trusted_devices id this call just created,
      // so /companion can join presence keyed by this device's actual identity rather than an
      // anonymous placeholder — see crossDevicePresenceSession.ts's file header.
      if (typeof data === "string") {
        window.localStorage.setItem("pawos_paired_device_id", data);
      }
      setStatus("success");
    } catch (err) {
      setError(getErrorMessage(err));
      setStatus("error");
    }
  };

  return (
    <div className="pawos-safe-area-top pawos-safe-area-bottom pawos-safe-area-x mx-auto max-w-md px-6 py-12">
      <h1 className="text-2xl font-bold">Pair this device</h1>
      <p className="mt-2 text-sm text-neutral-400">Signed in as {userEmail ?? "your account"}</p>

      <div className="mt-8 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        {status === "idle" && (
          <>
            <p className="text-sm text-neutral-300">
              This will link <strong>{detectDeviceName()}</strong> to your PawOS account as a trusted
              device — notifications, approvals, and a live preview of your desktop conversation
              will reach it from here on.
            </p>
            <button
              type="button"
              onClick={completePairing}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90"
            >
              Confirm pairing
            </button>
          </>
        )}
        {status === "pairing" && <p className="text-sm text-neutral-400">Pairing…</p>}
        {status === "success" && (
          <>
            <h2 className="font-semibold text-emerald-400">Device paired</h2>
            <p className="mt-2 text-sm text-neutral-400">
              Your desktop app should show this as connected within a moment. You can close this page.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h2 className="font-semibold text-red-400">Couldn&apos;t complete pairing</h2>
            <p className="mt-2 text-sm text-neutral-400">{error}</p>
            <p className="mt-2 text-xs text-neutral-500">
              If this code expired or was already used, go back to your desktop app and generate a
              new one.
            </p>
            <button
              type="button"
              onClick={completePairing}
              className="mt-4 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
