/**
 * Phase 5 of the Team & Enterprise Collaboration Platform — Remote
 * Assistance, Screen Sharing & Remote Control. Models the roadmap's
 * Section 5 request→approve state machine and Section 6's per-permission
 * control grants: every escalation (view, cursor, keyboard, terminal, ...)
 * is its own row with an explicit request-then-approve step, never a single
 * blanket "share my screen" grant.
 */

export type RemoteAssistanceStatus = 'requested' | 'notified' | 'declined' | 'active' | 'ended';

export type ShareScope = 'desktop' | 'window' | 'runtime' | 'browser' | 'infra';

export type RemoteAssistanceSession = {
  id: string;
  organizationId: string;
  workspaceId: string | null;
  requesterUserId: string;
  helperUserId: string | null;
  status: RemoteAssistanceStatus;
  shareScope: ShareScope | null;
  shareSourceId: string | null;
  requestedAt: string;
  joinedAt: string | null;
  endedAt: string | null;
};

/** Matches Section 6's "Remote Control — independent permission grants" table exactly. */
export type ControlGrantKind =
  | 'view_screen'
  | 'view_runtime'
  | 'move_cursor'
  | 'click_ui'
  | 'keyboard_input'
  | 'clipboard'
  | 'file_editing'
  | 'terminal'
  | 'browser_control'
  | 'infra_control';

export type ControlGrantStatus = 'requested' | 'granted' | 'denied' | 'revoked';

export type ControlGrant = {
  id: string;
  organizationId: string;
  sessionId: string;
  kind: ControlGrantKind;
  status: ControlGrantStatus;
  requestedBy: string;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  revokedAt: string | null;
};

/** Signaling payloads exchanged over a Supabase Realtime broadcast channel — reuses the Phase 4 channel pattern as the WebRTC signaling transport instead of standing up a separate signaling service. */
export type SignalingOfferPayload = { sdp: string; fromUserId: string };
export type SignalingAnswerPayload = { sdp: string; fromUserId: string };
export type SignalingIceCandidatePayload = { candidate: RTCIceCandidateInit; fromUserId: string };

export type RemoteCursorPayload = { xRatio: number; yRatio: number };
export type RemoteClickPayload = { xRatio: number; yRatio: number; button: 'left' | 'right' | 'middle' };
export type RemoteKeyPayload = { key: string; code: string; type: 'keydown' | 'keyup'; modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } };
export type RemoteTerminalDataPayload = { data: string };
