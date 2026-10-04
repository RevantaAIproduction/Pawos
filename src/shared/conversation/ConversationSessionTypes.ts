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
  /** Visuals drawn this turn (show_widget) — restored before the reply when the chat is reopened. */
  widgets?: { title: string; code: string; loadingMessages?: string[] }[];
  /** The project folder open in PawOS when this turn ran — none for a plain chat (resume, questions). */
  projectFolder?: string;
  /** Ticket evidence captured this turn — references only (no image bytes). Images reload from the local
   *  evidence cache, else from the run's durable storage (autonomous_run_evidence). */
  evidence?: ConversationEvidenceRef[];
};

export type ConversationEvidenceRef = {
  id: string;
  phase: 'before' | 'after';
  kind: 'image' | 'output';
  provider: string;
  label: string;
  targetDescription: string;
  /** The ticket run it was saved to (durable copy), when captured during one. */
  runId?: string;
  /** For an "after": the "before" of the same target, shown beside it. */
  beforeId?: string;
  output?: { source: string; status: number | null; text: string; timedOut?: boolean };
  pageSignals?: { title: string; consoleErrors: string[]; failedRequests: string[] };
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
  /** Project UUID (org_projects.id) this session is associated with, if any. */
  projectId?: string;
  /** The local project folder this chat belongs to (set by its first turn) — none for a plain chat. */
  projectFolder?: string;
  /**
   * The PawOS account this chat belongs to (the signed-in user when it started). Only chats that
   * belong to the signed-in account are synced to it — never another account's, and never chats
   * from before sign-in.
   */
  accountUserId?: string;
  /** The chat's id in the account's chat store (shared with PawOS Web and mobile), once synced. */
  accountChatId?: string;
  /** Where the chat started: in this desktop app, or on PawOS Web / mobile. */
  origin?: ChatSurface;
};

/** Where a conversation ran. Desktop has full capabilities; Web and mobile: chat and code changes. */
export type ChatSurface = 'desktop' | 'web';

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
  /** See ConversationSession.projectFolder. */
  projectFolder?: string;
  /** Where the chat started (see ConversationSession.origin). */
  surface?: ChatSurface;
  /** A chat from the account that isn't stored on this computer (started on Web, mobile or another computer). */
  remote?: boolean;
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
