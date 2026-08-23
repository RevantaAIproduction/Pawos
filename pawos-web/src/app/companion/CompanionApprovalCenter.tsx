"use client";

import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { publishCrossDeviceEvent, subscribeToCrossDeviceEvents } from "../../lib/mobilePresence/crossDeviceEventSubscription";

type PendingApproval = {
  requestId: string;
  summary: string;
};

/**
 * Approval Center (MOB-9) — shows the desktop's pending confirmation
 * question (published by ApprovalCenterBridge.ts whenever
 * ConversationRuntime is waiting on a plain "yes"/"no" reply) and lets this
 * phone answer it. Tapping Approve/Deny publishes an 'approvalResponse'
 * event carrying the same requestId; the desktop forwards it through
 * submitTranscript exactly as if the reply had been spoken there — this
 * page never executes anything itself. Only mounted once this browser has
 * completed pairing, matching CompanionPresence/CompanionNotifications.
 */
export function CompanionApprovalCenter({ userId }: { userId: string }) {
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const deviceId = window.localStorage.getItem("pawos_paired_device_id");
    if (!deviceId) return;

    const supabase = createClient();
    const unsubscribe = subscribeToCrossDeviceEvents(supabase, userId, (event) => {
      if (event.event_type !== "approvalRequired") return;
      const payload = event.payload ?? {};
      const requestId = typeof payload.requestId === "string" ? payload.requestId : null;
      const summary = typeof payload.summary === "string" ? payload.summary : null;
      if (!requestId || !summary) return;
      setPending({ requestId, summary });
      setResponding(false);
    });

    return unsubscribe;
  }, [userId]);

  const respond = async (approved: boolean) => {
    if (!pending || responding) return;
    setResponding(true);
    try {
      const supabase = createClient();
      await publishCrossDeviceEvent(supabase, "approvalResponse", "approvalCenter", {
        requestId: pending.requestId,
        approved,
      });
      setPending(null);
    } finally {
      setResponding(false);
    }
  };

  if (!pending) return null;

  // Add keyboard handling: Space/Enter → approve, Escape → deny
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      respond(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      respond(false);
    }
  };

  return (
    <div
      className="mt-6 rounded-2xl border border-amber-800/60 bg-amber-950/20 p-6"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Approval dialog"
    >
      <h2 className="font-semibold text-amber-200">Waiting on your approval</h2>
      <p className="mt-2 text-sm text-neutral-300">{pending.summary}</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => respond(true)}
          disabled={responding}
          autoFocus
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => respond(false)}
          disabled={responding}
          className="rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-100 transition hover:bg-neutral-900 disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
