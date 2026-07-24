import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { CursorBroadcastPayload, WorkspacePresenceMember } from '../../shared/organization/PresenceTypes';

const CURSOR_THROTTLE_MS = 80;

/**
 * Phase 4 — Presence (who's here) and live cursor broadcast, scoped to one
 * organization workspace. Supabase Realtime Presence + Broadcast on a
 * single channel per workspace, exactly as the roadmap's Section 4 design
 * specifies — no new Postgres table, nothing persisted (ephemeral by
 * design; a member closing the panel simply leaves the channel).
 *
 * Channel name is the workspace's own UUID, which is not guessable and
 * only ever handed to org members already authorized to see that
 * workspace (via the existing Postgres RLS on organization_workspaces) —
 * the same "channel name as shared secret" pattern most Realtime apps use
 * for presence/broadcast, since these events never touch a table RLS can
 * govern.
 */
export class WorkspacePresenceSession {
  private channel: RealtimeChannel | null = null;
  private lastCursorSentAt = 0;

  async join(
    workspaceId: string,
    self: { userId: string; displayName: string },
    onMembersChange: (members: WorkspacePresenceMember[]) => void,
    onCursor: (cursor: CursorBroadcastPayload) => void
  ): Promise<void> {
    const supabase = await getSupabaseClient();
    const channel = supabase.channel(`workspace-presence:${workspaceId}`, {
      config: { presence: { key: self.userId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ displayName: string; joinedAt: string }>();
      const members: WorkspacePresenceMember[] = Object.entries(state).map(([userId, entries]) => ({
        userId,
        displayName: entries[0]?.displayName ?? userId,
        joinedAt: entries[0]?.joinedAt ?? new Date().toISOString(),
      }));
      onMembersChange(members);
    });

    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      onCursor(payload as CursorBroadcastPayload);
    });

    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ displayName: self.displayName, joinedAt: new Date().toISOString() }).then(() => {
            resolve();
          });
        }
      });
    });

    this.channel = channel;
  }

  /** Throttled — never floods the channel with every raw mousemove event. */
  sendCursor(payload: CursorBroadcastPayload): void {
    const now = Date.now();
    if (now - this.lastCursorSentAt < CURSOR_THROTTLE_MS) return;
    this.lastCursorSentAt = now;
    this.channel?.send({ type: 'broadcast', event: 'cursor', payload });
  }

  async leave(): Promise<void> {
    if (!this.channel) return;
    await this.channel.untrack();
    await this.channel.unsubscribe();
    this.channel = null;
  }
}
