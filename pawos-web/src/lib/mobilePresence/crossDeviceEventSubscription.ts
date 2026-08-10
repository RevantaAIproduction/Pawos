import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type CrossDeviceEventRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  event_type: string;
  source_runtime: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  delivered_at: string | null;
};

/**
 * Cross Device Runtime — pawos-web's side of the same `cross_device_events`
 * outbox the Electron app subscribes to
 * (src/renderer/mobilePresence/CrossDeviceRuntimeClient.ts), duplicated
 * rather than shared for the same reason as crossDevicePresenceSession.ts:
 * the Electron renderer and Next.js bundles can't import each other's
 * modules. Events are append-only, never updated, so 'INSERT' is the only
 * event that can ever matter here.
 */
/**
 * Publishes into the same shared outbox via the security-definer RPC
 * (mirrors CrossDeviceRuntimeClient.publish on the Electron side) — never a
 * direct table insert, since publish_cross_device_event authorization-checks
 * the caller against the target user/organization itself.
 */
export async function publishCrossDeviceEvent(
  supabase: SupabaseClient,
  eventType: string,
  sourceRuntime: string,
  payload: Record<string, unknown> = {}
): Promise<string> {
  const { data, error } = await supabase.rpc('publish_cross_device_event', {
    p_event_type: eventType,
    p_source_runtime: sourceRuntime,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export function subscribeToCrossDeviceEvents(
  supabase: SupabaseClient,
  userId: string,
  onEvent: (event: CrossDeviceEventRow) => void
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`cross-device-events:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "cross_device_events", filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = payload.new as CrossDeviceEventRow | undefined;
        if (row) onEvent(row);
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}
