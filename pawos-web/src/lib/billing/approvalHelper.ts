// src/lib/billing/approvalHelper.ts

import { createClient } from "../supabase/client";
import { publishCrossDeviceEvent, subscribeToCrossDeviceEvents } from "../mobilePresence/crossDeviceEventSubscription";

/**
 * Publishes an approval request and waits for the user's response.
 * Returns true if approved, false if denied or timeout.
 */
export async function requestApproval(
  userId: string,
  summary: string,
  timeoutMs: number = 120000
): Promise<boolean> {
  const requestId = crypto.randomUUID();
  const supabase = createClient();

  // Publish the request
  await publishCrossDeviceEvent(supabase, "approvalRequired", "approvalCenter", {
    requestId,
    summary,
  });

  return new Promise<boolean>((resolve) => {
    const unsubscribe = subscribeToCrossDeviceEvents(
      supabase,
      userId,
      (event) => {
        if (event.event_type !== "approvalResponse") return;
        const payload = event.payload ?? {};
        if (payload.requestId !== requestId) return;
        const approved = Boolean(payload.approved);
        resolve(approved);
        unsubscribe();
      }
    );

    // Timeout handling
    setTimeout(() => {
      resolve(false);
      unsubscribe();
    }, timeoutMs);
  });
}
