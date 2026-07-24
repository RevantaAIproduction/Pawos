/**
 * Phase 4 of the Team & Enterprise Collaboration Platform — Presence &
 * Live Collaboration. Ephemeral by design (roadmap: "cursors ... never
 * persisted") — these types describe in-memory Realtime presence/broadcast
 * payloads, never rows in a table.
 */

export type WorkspacePresenceMember = {
  userId: string;
  displayName: string;
  joinedAt: string;
};

export type CursorBroadcastPayload = {
  userId: string;
  displayName: string;
  color: string;
  /** Fractional position (0–1) within the viewer's own container, so it renders sensibly regardless of each viewer's window size. */
  xRatio: number;
  yRatio: number;
};
