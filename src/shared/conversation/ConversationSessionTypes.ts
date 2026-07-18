/**
 * Electron's persisted memory of every conversation — mirrors the shape of
 * the renderer's ConversationTurnRecord (src/renderer/conversation/
 * ConversationTypes.ts) so a finished turn can be handed across the IPC
 * boundary without translation. Owned and stored by the main process
 * (ConversationSessionStore); the renderer only ever reads, searches, and
 * organizes it — never edits a turn's content.
 */
export type ConversationSessionActionRecord = {
  type: string;
  ok: boolean;
  label: string;
};

export type ConversationSessionTurn = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  transcript: string;
  assistantResponse: string;
  actionsExecuted: ConversationSessionActionRecord[];
  errors: string[];
  model: string;
  voice: string;
  endedReason: 'completed' | 'interrupted' | 'error' | null;
};

export type ConversationSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  turns: ConversationSessionTurn[];
  filesCreated: string[];
  applicationsOpened: string[];
};

/** List/search results omit full turn transcripts — the dashboard list view only needs this much. */
export type ConversationSessionSummary = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  turnCount: number;
  durationMs: number;
  lastMessage: string;
};

/**
 * How a finished turn should be filed. 'continue'/'new' are explicit
 * decisions (from semantic session classification, or a runtime already
 * knowing which session it's in) that the store must honor as-is; 'auto'
 * means no decision was made — the store falls back to its own
 * still-warm-session heuristic. Kept as a discriminated union (rather than
 * a nullable sessionId) so an explicit "start new" can never be silently
 * reinterpreted as "let the heuristic decide."
 */
export type SessionContinuationHint = { type: 'continue'; sessionId: string } | { type: 'new' } | { type: 'auto' };
