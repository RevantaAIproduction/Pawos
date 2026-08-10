import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { CrossDeviceEvent, CrossDeviceEventType } from '../../shared/mobilePresence/MobilePresenceTypes';

type CrossDeviceEventRow = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  event_type: CrossDeviceEventType;
  source_runtime: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  delivered_at: string | null;
};

function toCrossDeviceEvent(row: CrossDeviceEventRow): CrossDeviceEvent {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    eventType: row.event_type,
    sourceRuntime: row.source_runtime,
    payload: row.payload ?? {},
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

/**
 * Cross Device Runtime — the shared real-time event bus every Mobile
 * Presence module publishes into instead of inventing its own delivery
 * mechanism (see MobilePresenceTypes.ts's file header). This client is the
 * MOB-5-scoped slice: a subscription to this account's own event stream,
 * used today only by the Pairing Runtime's `devicePaired`/`deviceRevoked`
 * events. MOB-6 generalizes this into the full Cross Device Runtime
 * (presence, planner updates, desktop status) — this file is the module
 * every later runtime (Notification, Conversation Sync, Approval Center)
 * is expected to build on rather than opening its own Realtime channel.
 */
export const crossDeviceRuntimeClient = {
  /** Live subscription to every cross_device_events row insert for this account — events are append-only, never updated, so 'INSERT' is the only event that can ever matter here. */
  subscribeToEvents(userId: string, onEvent: (event: CrossDeviceEvent) => void): () => void {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    getSupabaseClient().then((supabase) => {
      if (cancelled) return;
      channel = supabase
        .channel(`cross-device-events:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'cross_device_events', filter: `user_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as CrossDeviceEventRow | undefined;
            if (row) onEvent(toCrossDeviceEvent(row));
          }
        )
        .subscribe();
    });
    return () => {
      cancelled = true;
      channel?.unsubscribe();
    };
  },

  /** Publishes into the shared outbox via the security-definer RPC (never a direct table insert — publish_cross_device_event authorization-checks the caller). Pairing itself doesn't call this: complete_pairing_session/revoke_trusted_device already publish server-side. Reserved for MOB-6+ runtimes (Notification, Conversation Sync, Approval Center) that need to originate their own events. */
  async publish(
    eventType: CrossDeviceEventType,
    sourceRuntime: string,
    payload: Record<string, unknown> = {},
    target: { userId?: string; organizationId?: string } = {}
  ): Promise<string> {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.rpc('publish_cross_device_event', {
      p_event_type: eventType,
      p_source_runtime: sourceRuntime,
      p_payload: payload,
      p_user_id: target.userId ?? null,
      p_organization_id: target.organizationId ?? null,
    });
    if (error) throw error;
    return data as string;
  },
};
