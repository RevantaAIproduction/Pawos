export type ConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'performingAction'
  | 'speaking'
  | 'interrupted'
  | 'completed'
  | 'error'
  | 'waitingForPermission';

export type ConversationRole = 'system' | 'user' | 'assistant';

/**
 * One action within a Task (see ConversationTaskRecord) — the real
 * request/result, not just its narration, so the Task Details panel can
 * show the actual command/path/output for every step of the timeline.
 * Generic across every action type — never a per-type shape, since
 * ActionRequest/ActionResult already cover that.
 */
export type ConversationTaskAction = {
  id: string;
  type: string;
  request: import('../../shared/actions/ActionTypes').ActionRequest;
  result?: import('../../shared/actions/ActionTypes').ActionResult;
  startedAt: number;
  endedAt: number | null;
  inProgressText: string;
  doneText?: string;
};

/**
 * 'interrupted' is distinct from 'failed': the task was cut off (panel
 * closed, barge-in, explicit cancel) before its planned work finished —
 * never inferred from "no action reported ok:false", which would
 * wrongly read an interrupted task as 'completed'. See finalizeTask in
 * ConversationRuntime.ts, the one place this is ever set.
 */
export type ConversationTaskStatus = 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * One user request that triggered real desktop work ("Install Java.") —
 * the unit the conversation shows as a single Task Card instead of one
 * chat line per action. Everything that happened while carrying it out
 * lives here for the expandable Task Details view (timeline, commands,
 * files touched, env changes, verification, errors, recovery, final
 * report) — the conversation itself only ever shows the card's summary.
 */
export type ConversationTaskRecord = {
  id: string;
  goal: string;
  status: ConversationTaskStatus;
  startedAt: number;
  endedAt: number | null;
  actions: ConversationTaskAction[];
  finalReport?: string;
};

export type ConversationMessage = {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: number;
  status: 'final' | 'streaming';
  /** Present only on the one system message per turn that represents a Task Card — see ConversationTaskRecord. */
  task?: ConversationTaskRecord;
};

/**
 * Voice and typing feed the exact same pipeline (submitTranscript) — this is
 * how a THIRD input mode (pasted text, an uploaded file) still goes through
 * that one pipeline while telling the reasoning call how the content
 * arrived, without changing what's displayed/stored as the turn's transcript.
 */
export type SubmittedInputContext = {
  /** What's actually sent to the reasoning provider, if different from the displayed/stored transcript (e.g. a file's real content vs. its "📎 name.txt" display text). Defaults to the transcript itself. */
  reasoningText?: string;
  /** Provenance — lets the reasoning call react appropriately (e.g. read/summarize pasted or uploaded content instead of treating it as a spoken command) without a separate pipeline. */
  source?: 'typed' | 'pasted' | 'file' | 'image';
  /** Present only when source is 'image' — a base64 data: URL of the attached/pasted reference image (screenshot, mockup, logo). Never inlined into the text reasoning call; analyze_reference_image reads this directly. */
  imageDataUrl?: string;
};

export type ConversationSnapshot = {
  panelOpen: boolean;
  state: ConversationState;
  messages: ConversationMessage[];
  draftTranscript: string;
  errorMessage: string | null;
  supportsSpeechRecognition: boolean;
  supportsSpeechSynthesis: boolean;
};

export const conversationStateLabels: Record<ConversationState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  transcribing: 'Processing speech',
  thinking: 'Thinking',
  performingAction: 'Performing action',
  speaking: 'Speaking',
  interrupted: 'Interrupted',
  completed: 'Completed',
  error: 'Error',
  waitingForPermission: 'Waiting for permission',
};

/** One executed action, recorded on the turn that requested it — the basis for future history/analytics, not shown in any UI yet. */
export type ConversationActionRecord = {
  type: string;
  ok: boolean;
  label: string;
};

/**
 * Full record of a single conversation turn (one user input through to Paw's
 * reply, or its interruption/failure) — conversation metadata per the
 * runtime spec: id, timing, transcript, actions, errors, model/voice used.
 * Kept in-memory only for now; no persistence or UI surfaces it yet.
 */
export type ConversationTurnRecord = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  transcript: string;
  assistantResponse: string;
  actionsExecuted: ConversationActionRecord[];
  errors: string[];
  model: string;
  voice: string;
  endedReason: 'completed' | 'interrupted' | 'error' | null;
};

/** A single state transition or notable runtime event — structured, dev-console-only debugging, never rendered to the user. */
export type ConversationLogEntry = {
  timestamp: number;
  event: string;
  data?: Record<string, unknown>;
};
