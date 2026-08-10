"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { subscribeToCrossDeviceEvents } from "../../lib/mobilePresence/crossDeviceEventSubscription";

type LatestTurn = {
  role: string;
  preview: string;
  receivedAt: number;
};

/**
 * Conversation Sync (MOB-8) — a live, read-only preview of what's being said
 * on the desktop, fed by the same `conversationMessage` cross_device_events
 * the Electron app publishes (see ConversationSyncPublisher.ts). This is
 * explicitly NOT two-way chat: there is no server-side AI endpoint yet for
 * this page to send a reply to, so it only ever renders the latest turn it
 * received. Only mounted once this browser has completed pairing, matching
 * CompanionPresence/CompanionNotifications.
 */
export function CompanionConversationSync({ userId }: { userId: string }) {
  const [latest, setLatest] = useState<LatestTurn | null>(null);

  useEffect(() => {
    const deviceId = window.localStorage.getItem("pawos_paired_device_id");
    if (!deviceId) return;

    const supabase = createClient();
    const unsubscribe = subscribeToCrossDeviceEvents(supabase, userId, (event) => {
      if (event.event_type !== "conversationMessage") return;
      const payload = event.payload ?? {};
      const role = typeof payload.role === "string" ? payload.role : "assistant";
      const preview = typeof payload.preview === "string" ? payload.preview : "";
      if (!preview) return;
      setLatest({ role, preview, receivedAt: Date.now() });
    });

    return unsubscribe;
  }, [userId]);

  if (!latest) return null;

  return (
    <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
      <h2 className="font-semibold">Live from your desktop</h2>
      <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">
        {latest.role === "user" ? "You said" : "Paw said"}
      </p>
      <p className="mt-1 text-sm text-neutral-300">{latest.preview}</p>
      <p className="mt-3 text-xs text-neutral-500">
        This is a live preview only — replying from here is arriving in an upcoming update.
      </p>
    </div>
  );
}
