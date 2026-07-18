/**
 * Communication Intelligence Runtime — shared entity/registry/adapter
 * shapes, usable from both main and renderer (same discipline as
 * shared/actions/ActionTypes.ts: no Electron-only or DOM-only imports
 * here). Source of truth for the architecture frozen in
 * COMMUNICATION_INTELLIGENCE_RUNTIME.md — this file must not redesign
 * anything documented there, only implement it.
 */

// ---------------------------------------------------------------------------
// Universal Communication Sources (architecture doc §4)
// ---------------------------------------------------------------------------

export type CommunicationChannelKind = 'audio' | 'text' | 'mixed';

export type CommunicationCaptureMechanism = 'desktopAudio' | 'mobileAudio' | 'adapterIngest';

export type CommunicationSourceDescriptor = {
  id: string;
  displayName: string;
  channelKind: CommunicationChannelKind;
  capturedVia: CommunicationCaptureMechanism;
  requiresAdapter: 'meetingProvider' | 'messaging' | 'mail' | 'phoneCall' | null;
};

// ---------------------------------------------------------------------------
// Storage Layer (architecture doc §6)
// ---------------------------------------------------------------------------

export type CommunicationStatus = 'recording' | 'processing' | 'completed' | 'failed' | 'interrupted';

/** Which mechanism actually produced a recording — 'meetingParticipant' (Paw joined the call as a real bot participant, the preferred mode) or 'desktopCapture' (mic/system-audio, the automatic fallback when joining isn't available) or 'direct' (face-to-face/voice note, no meeting provider involved at all). Higher layers (pipeline, timeline, search, workspace) never branch on this — both meeting modes produce the exact same CommunicationRecord/transcript/summary shape. It exists purely so the user can be told honestly which mode captured a given recording. */
export type RecordingMode = 'meetingParticipant' | 'desktopCapture' | 'direct';

export type CommunicationPipelineStage =
  | 'transcribing'
  | 'summarizing'
  | 'extractingActionItems'
  | 'detectingSignals'
  | 'updatingMemory'
  | 'done';

export type CommunicationRecord = {
  id: string;
  medium: string; // CommunicationSourceDescriptor id — open-ended, validated against the registry, not a fixed union
  title: string;
  startedAt: number;
  endedAt: number | null;
  status: CommunicationStatus;
  pipelineStage: CommunicationPipelineStage;
  capturedVia: CommunicationCaptureMechanism;
  deviceId: string | null;
  participants: string[]; // ParticipantRecord ids
  companies: string[]; // CompanyRecord ids
  projects: string[]; // ProjectRecord ids
  tags: string[];
  audioPath: string | null;
  transcriptPath: string | null;
  bodyPath: string | null;
  summaryPath: string | null;
  attachmentPaths: string[];
  sourceMeetingId: string | null;
  sourceThreadId: string | null;
  createdAt: number;
  updatedAt: number;
  meetingMetadata?: MeetingMetadata;
  /** Which mechanism actually captured this recording — null until capture actually starts and the runtime knows (join attempted+result, or direct for face-to-face/voice notes). */
  recordingMode: RecordingMode | null;
  /** Every recording session for a meeting or phone call must begin with an explicit, recorded confirmation that the user has the other participants' consent — never inferred, never skipped. Always true (and irrelevant) for direct sources (face-to-face/voice note) where the user is recording their own conversation by their own explicit "start recording" command. */
  consentConfirmed: boolean;
  consentConfirmedAt: number | null;
  /** Real path to captured video, when the capture mode actually supports it — null otherwise, never fabricated (architecture note: "record meeting video when supported"). */
  videoPath: string | null;
  /** Derived once transcription completes — real speaker segments from the transcript, never invented turn-taking. */
  speakerTimeline: SpeakerTimelineEntry[];
  /** Real screen-share/visual-context events, timestamped — only ever populated when the capture mode actually reports them (meeting-participant mode with a provider that exposes it); empty otherwise, never guessed. */
  visualEvidence: VisualEvidenceEvent[];
};

export type SpeakerTimelineEntry = { speaker: string; startedAtSeconds: number; endedAtSeconds: number | null };

export type VisualEvidenceEvent = {
  atSeconds: number;
  kind: 'screenShareStarted' | 'screenShareStopped' | 'slideChanged' | 'documentShared' | 'whiteboardShared' | 'browserShared' | 'applicationShared';
  description: string;
  /** Real captured frame, only when the provider/local runtime actually supports frame capture — absent otherwise. */
  screenshotPath?: string;
};

/** Extra metadata for meeting-style sources (§ "Meeting Recording" of the implementation mission) — every field is optional because providers don't expose the same capabilities. */
export type MeetingMetadata = {
  providerId: string | null;
  participants: MeetingParticipantEvent[];
  cameraStatus: 'on' | 'off' | 'unknown';
  microphoneStatus: 'on' | 'off' | 'unknown';
  screenSharing: 'detected' | 'notDetected' | 'unknown';
  recordingStatus: 'recording' | 'notRecording' | 'unknown';
};

export type MeetingParticipantEvent = {
  name: string;
  joinedAt: number | null;
  leftAt: number | null;
};

/** How actively a relationship is being maintained — derived only from real communication timestamps (gaps between real sessions), never guessed from sentiment. */
export type RelationshipHealthStatus = 'new' | 'active' | 'cooling' | 'dormant';

export type RelationshipHealth = {
  status: RelationshipHealthStatus;
  lastInteractionAt: number | null;
  /** Plain-language reason grounded in real dates ("last real conversation was 47 days ago") — never a vibe assessment. */
  reasoning: string;
};

/** A topic that has come up across real communications — evidenceCommunicationIds always lists the real sessions it was actually seen in; never a topic with zero evidence. */
export type FrequentTopic = {
  topic: string;
  mentionCount: number;
  lastMentionedAt: number;
  evidenceCommunicationIds: string[];
};

export type ParticipantRecord = {
  id: string;
  name: string;
  role: string | null;
  companyId: string | null;
  emails: string[];
  phones: string[];
  externalHandles: { source: string; handle: string }[];
  firstSeenAt: number;
  lastSeenAt: number;
  communicationIds: string[];
  /** Real, evidence-derived signals — every field here is either empty/null (nothing evidenced yet) or backed by real linked communications, never inferred from a single word. */
  relationshipHealth: RelationshipHealth | null;
  frequentTopics: FrequentTopic[];
  /** Short, evidence-grounded observation about how this person communicates (e.g. "prefers async updates over calls, evidenced across 3 conversations") — null until real evidence exists across 2+ communications. */
  communicationStyle: string | null;
  /** Real interests/priorities the person has actually stated, each tied to the communication it came from — never guessed from role/title alone. */
  interests: { description: string; evidenceCommunicationId: string }[];
};

export type CompanyRecord = {
  id: string;
  name: string;
  domain: string | null;
  participantIds: string[];
  communicationIds: string[];
  projectIds: string[];
  relationshipHealth: RelationshipHealth | null;
  frequentTopics: FrequentTopic[];
  /** Real risks/opportunities the model has actually extracted from linked communications' signals — never invented from the company name/domain. */
  risks: { description: string; evidenceCommunicationId: string; atSeconds: number | null }[];
  opportunities: { description: string; evidenceCommunicationId: string; atSeconds: number | null }[];
};

export type ProjectRecord = {
  id: string;
  name: string;
  companyIds: string[];
  communicationIds: string[];
};

// ---------------------------------------------------------------------------
// Communication Memory / Relationship Graph (architecture doc §7, §10)
// ---------------------------------------------------------------------------

export type RelationshipNodeKind = 'participant' | 'company' | 'project' | 'communication';

export type RelationshipNode = { kind: RelationshipNodeKind; id: string };

export type RelationshipEdgeKind =
  | 'participantWorksAt'
  | 'participantInCommunication'
  | 'communicationAboutProject'
  | 'projectForCompany'
  | 'communicationMentionsCompany';

export type RelationshipEdge = {
  kind: RelationshipEdgeKind;
  from: RelationshipNode;
  to: RelationshipNode;
  evidenceCommunicationId: string | null;
};

// ---------------------------------------------------------------------------
// Unified Communication Timeline (architecture doc §8)
// ---------------------------------------------------------------------------

export type TimelineEntryKind = 'communication' | 'followUp' | 'contact' | 'company' | 'actionItem' | 'decision';

export type UnifiedTimelineEntry = {
  kind: TimelineEntryKind;
  id: string;
  occurredAt: number;
  medium: string;
  participants: string[];
  companyIds: string[];
  projectIds: string[];
  headline: string;
  relatedCommunicationId: string | null;
};

export type TimelineScope = {
  participantId?: string;
  companyId?: string;
  projectId?: string;
  dateRange?: { from: number; to: number };
  medium?: string;
};

// ---------------------------------------------------------------------------
// Company Workspace (architecture doc §9)
// ---------------------------------------------------------------------------

export type CompanyFileRef = {
  path: string;
  communicationId: string;
  addedAt: number;
  originalFilename: string;
};

export type CompanyWorkspace = {
  company: CompanyRecord;
  projects: ProjectRecord[];
  participants: ParticipantRecord[];
  timeline: UnifiedTimelineEntry[];
  files: CompanyFileRef[];
  openActionItems: ActionItem[];
  openTaskIds: string[];
};

// ---------------------------------------------------------------------------
// Intelligence Layer output shapes (architecture doc §11)
// ---------------------------------------------------------------------------

export type CommunicationSummary = {
  communicationId: string;
  headline: string;
  summary: string;
  keyPoints: string[];
  generatedAt: number;
  model: string;
  /** Meeting Follow-up Intelligence — a longer-form narrative summary suitable for sharing, and honest gaps (risks/open questions) surfaced rather than glossed over. Empty arrays mean genuinely none were found, not "not generated". */
  executiveSummary: string;
  risks: string[];
  openQuestions: string[];
  suggestedNextAgenda: string[];
};

export type ActionItem = {
  id: string;
  communicationId: string;
  description: string;
  owner: string | null;
  dueHint: string | null;
  status: 'open' | 'done' | 'dismissed';
  /** Approximate second in the transcript this was said — null when the source transcript had no timing (e.g. a text-ingested source). Every action item/follow-up/decision/signal must be traceable back to real transcript evidence, never a floating claim. */
  atSeconds: number | null;
};

export type FollowUp = {
  id: string;
  communicationId: string;
  reason: string;
  suggestedAction: string;
  suggestedWhen: string | null;
  atSeconds: number | null;
};

export type CommunicationSignal = {
  communicationId: string;
  kind: 'buyingSignal' | 'decisionMaker' | 'interestLevel' | 'objection' | 'risk';
  participant: string | null;
  evidence: string;
  confidence: 'low' | 'medium' | 'high';
  atSeconds: number | null;
};

export type Decision = {
  id: string;
  communicationId: string;
  description: string;
  decidedBy: string | null;
  atSeconds: number | null;
};

export type SyncState = {
  communicationId: string;
  connectorId: string;
  externalRecordId: string | null;
  lastAttemptAt: number;
  lastResult: 'ok' | 'failed' | 'pending';
  lastError: string | null;
};

// ---------------------------------------------------------------------------
// Per-session canonical timeline (session storage architecture) — the
// merged, chronological view of everything real that happened in one
// session: transcript speaker turns, action items, decisions, follow-ups,
// signals, and visual evidence, each citing a real atSeconds. Written once
// per session to timeline.json; never a second source of truth — every
// entry here is derived from data that already exists in the per-session
// JSON files (action-items.json etc.) or the transcript, merged and sorted.
// ---------------------------------------------------------------------------

export type SessionTimelineEntryKind =
  | 'transcriptSegment'
  | 'speakerChange'
  | 'actionItem'
  | 'decision'
  | 'followUp'
  | 'signal'
  | 'visualEvidence';

export type SessionTimelineEntry = {
  atSeconds: number;
  kind: SessionTimelineEntryKind;
  description: string;
  /** id of the underlying ActionItem/Decision/FollowUp/CommunicationSignal this entry was derived from — null for transcript/visual/speaker entries, which reference themselves directly. */
  refId: string | null;
};

// ---------------------------------------------------------------------------
// Email Follow-up (Communication Intelligence Runtime, Email Follow-up)
// ---------------------------------------------------------------------------

export type EmailProviderKind = 'gmail' | 'outlook' | 'microsoft365' | 'googleWorkspace' | 'default';

/**
 * A plain, unauthenticated preference — not a login, not a connected
 * account. Tells Paw which provider's compose URL to build; Paw never
 * stores credentials or authenticates with any email provider.
 */
export type EmailPreferences = {
  displayName: string;
  emailAddress: string;
  provider: EmailProviderKind;
  savedAt: number;
};

export type EmailRecipientState = {
  status: 'pending' | 'sent';
  sentAt?: number;
};

export type EmailDraft = {
  id: string;
  communicationId: string;
  subject: string;
  body: string;
  recipients: string[];
  attachmentPaths: string[];
  createdAt: number;
  /** Keyed by recipient email — absent or 'pending' means not yet confirmed sent. Never set except in direct response to an explicit user confirmation. */
  recipientStatus?: Record<string, EmailRecipientState>;
  /** User chose "Keep Private" — no further send action should be offered for this draft. */
  keptPrivate?: boolean;
};

export type SentEmailRecord = {
  id: string;
  communicationId: string;
  subject: string;
  body: string;
  recipients: string[];
  attachmentPaths: string[];
  sentAt: number;
  /** The only delivery method this runtime supports — Paw opens a browser compose window and the user sends it themselves; this record only ever exists because the user explicitly confirmed the send. */
  deliveryMethod: 'browserComposeConfirmed';
};

// ---------------------------------------------------------------------------
// Connector Layer adapter interfaces (architecture doc §12)
// ---------------------------------------------------------------------------

export type AdapterResult<T = void> = { ok: true; data?: T } | { ok: false; message: string; reason?: string };

export type MeetingProviderCapability =
  | 'detectActiveMeeting'
  | 'meetingMetadata'
  | 'participantList'
  | 'joinLeaveEvents'
  | 'calendarLink';

export type MeetingEvent =
  | { type: 'started'; meetingId: string; title: string; startedAt: number }
  | { type: 'participantJoined'; meetingId: string; participant: string; at: number }
  | { type: 'participantLeft'; meetingId: string; participant: string; at: number }
  | { type: 'ended'; meetingId: string; endedAt: number };

export interface MeetingProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<MeetingProviderCapability>;
  detect(): Promise<boolean>;
  getActiveMeeting(): Promise<{ meetingId: string; title: string } | null>;
  getParticipants(meetingId: string): Promise<string[]>;
  subscribe(onEvent: (event: MeetingEvent) => void): () => void;
}

/**
 * Meeting Participant architecture — Paw as a real bot participant in the
 * call (the preferred recording mode, Fathom/Otter/Fireflies-style),
 * never provider-specific logic outside these adapters. Every concrete
 * implementation (Zoom/Google Meet/Teams/Webex) is honest about whether it
 * can actually join: `canJoin()` checks for real, configured platform
 * credentials — with none configured, it truthfully returns false, and
 * CommunicationRuntime automatically falls back to desktop capture
 * (MeetingProviderAdapter above) rather than failing. Both modes produce
 * the identical CommunicationRecord shape; nothing above this adapter
 * layer ever needs to know which one actually ran.
 */
export type MeetingParticipantCapability =
  | 'joinMeeting'
  | 'recordAudio'
  | 'recordVideo'
  | 'detectScreenShare'
  | 'trackParticipants'
  | 'trackSpeakerTimeline'
  | 'captureFrames';

export type MeetingParticipantSessionEvent =
  | { type: 'joined'; sessionId: string; joinedAt: number }
  | { type: 'left'; sessionId: string; leftAt: number }
  | { type: 'participantJoined'; sessionId: string; participant: string; at: number }
  | { type: 'participantLeft'; sessionId: string; participant: string; at: number }
  | { type: 'speakerChanged'; sessionId: string; speaker: string; at: number }
  | { type: 'screenShareStarted'; sessionId: string; at: number }
  | { type: 'screenShareStopped'; sessionId: string; at: number }
  | { type: 'screenShareContentChanged'; sessionId: string; at: number; description: string };

export interface MeetingParticipantAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<MeetingParticipantCapability>;
  /** Real, honest capability check — true only when this provider's actual join mechanism (SDK/API credentials) is genuinely configured. Never optimistic. */
  canJoin(): Promise<boolean>;
  join(input: { meetingUrl?: string; displayAs: string }): Promise<AdapterResult<{ sessionId: string }>>;
  leave(sessionId: string): Promise<AdapterResult>;
  subscribe(sessionId: string, onEvent: (event: MeetingParticipantSessionEvent) => void): () => void;
}

export type MessagingCapability = 'readThread' | 'watchThread' | 'sendMessage';

export type IngestedMessage = {
  externalId: string;
  from: string;
  body: string;
  occurredAt: number;
  attachments: string[];
};

export interface MessagingAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<MessagingCapability>;
  authenticate(): Promise<AdapterResult>;
  ingestThread(threadId: string): Promise<AdapterResult<CommunicationRecord>>;
  watchThread(threadId: string, onMessage: (msg: IngestedMessage) => void): () => void;
}

export type MailCapability = 'readThread' | 'watchInbox';

export interface MailAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<MailCapability>;
  authenticate(): Promise<AdapterResult>;
  ingestThread(threadId: string): Promise<AdapterResult<CommunicationRecord>>;
}

export type CrmCapability = 'readContact' | 'writeContact' | 'readCompany' | 'writeCompany' | 'logActivity' | 'writeDeal';

export interface CrmAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<CrmCapability>;
  authenticate(): Promise<AdapterResult>;
  findContact(query: { email?: string; name?: string }): Promise<AdapterResult<{ externalId: string } | null>>;
  upsertContact(contact: ParticipantRecord): Promise<AdapterResult<{ externalId: string }>>;
  logActivity(activity: { externalContactId: string; summary: string; occurredAt: number }): Promise<AdapterResult>;
}

export type CalendarCapability = 'readEvents' | 'matchMeeting' | 'createFollowUpEvent';

export interface CalendarAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<CalendarCapability>;
  authenticate(): Promise<AdapterResult>;
  findEventForMeeting(meetingId: string, aroundTime: number): Promise<AdapterResult<{ eventId: string; title: string; attendees: string[] } | null>>;
  createFollowUpEvent(event: { title: string; when: number; attendees: string[] }): Promise<AdapterResult<{ eventId: string }>>;
}

/**
 * Phone calls are a Communication Source with their own adapter kind, never
 * a single hardcoded mobile-app assumption — 'mobileCompanion' is the first
 * implementation, but the interface equally accommodates a future Android/
 * iPhone companion, a VoIP provider, or a business telephony integration.
 * `isAvailable()` is honest: the Mobile Companion adapter reports false
 * until a real paired, connected device with active call-capture support
 * exists — this session builds the full desktop-side architecture (consent,
 * session lifecycle, storage, pipeline, timeline, search, workspace)
 * without needing that device to exist yet.
 */
export type PhoneCallCapability = 'inboundCapture' | 'outboundCapture' | 'consentPrompt';

export interface PhoneCallAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: ReadonlySet<PhoneCallCapability>;
  isAvailable(): Promise<boolean>;
  beginSession(input: { deviceId?: string }): Promise<AdapterResult<{ sessionId: string }>>;
  endSession(sessionId: string): Promise<AdapterResult>;
}

// ---------------------------------------------------------------------------
// Mobile Companion (architecture doc §13)
// ---------------------------------------------------------------------------

export type PairedDeviceRecord = {
  deviceId: string;
  name: string;
  pairedAt: number;
  revokedAt: number | null;
  publicKey: string;
};

export type CapturePermissionSource = 'microphone' | 'systemAudio' | 'mobilePairing' | 'backgroundRecording';

export type CapturePermission = {
  source: CapturePermissionSource;
  scope: 'oneTime' | 'session' | 'standing';
  grantedAt: number;
  revokedAt: number | null;
};

// ---------------------------------------------------------------------------
// Runtime API event shape (architecture doc §16) — the wire shape pushed
// over IPC to every window subscribed to Communication Runtime events.
// ---------------------------------------------------------------------------

export type CommunicationRuntimeEvent =
  | { type: 'captureStarted'; communicationId: string }
  | { type: 'captureStatusChanged'; communicationId: string; status: CommunicationStatus }
  | { type: 'recordingModeChanged'; communicationId: string; mode: RecordingMode }
  | { type: 'transcriptUpdated'; communicationId: string; latestText: string }
  | { type: 'participantDetected'; communicationId: string; participant: string }
  | { type: 'actionItemDetected'; communicationId: string; actionItem: ActionItem }
  | { type: 'decisionDetected'; communicationId: string; decision: Decision }
  | { type: 'speakerChanged'; communicationId: string; speaker: string; atSeconds: number }
  | { type: 'screenShareChanged'; communicationId: string; event: VisualEvidenceEvent }
  | { type: 'pipelineStageChanged'; communicationId: string; stage: CommunicationPipelineStage }
  | { type: 'processingComplete'; communicationId: string }
  /** A real meeting app/tab was just detected running (desktop-first architecture) — no communicationId yet, since nothing has started recording. Fired once per genuine start transition, never while already recording that medium. */
  | { type: 'meetingDetected'; medium: string; title: string; meetingId: string };

// ---------------------------------------------------------------------------
// Search (architecture doc §19)
// ---------------------------------------------------------------------------

export type SearchQuery = {
  text?: string;
  filters?: TimelineScope;
};

export type SearchResult = {
  entry: UnifiedTimelineEntry;
  matchedExcerpt: string | null;
  score: number;
};

export type ParsedSearchIntent = {
  filters: TimelineScope;
  fullTextTerms: string[];
  originalQuery: string;
};

/** One row in the persisted cross-entity search index (index/search.db) — real, denormalized text pulled from the authoritative store at write time, rebuilt/appended incrementally so search never needs to re-read every transcript file from disk on each query. */
export type SearchIndexEntry = {
  id: string;
  kind: 'communication' | 'contact' | 'company' | 'actionItem' | 'decision' | 'followUp';
  text: string;
  headline: string;
  communicationId: string | null;
  occurredAt: number;
};
