import { v4 as uuidv4 } from 'uuid';
import { startCommunicationAudioCapture, type CaptureHandle } from '../communication/CommunicationAudioCapture';
import type {
  ConversationLogEntry,
  ConversationMessage,
  ConversationSnapshot,
  ConversationState,
  ConversationTaskAction,
  ConversationTaskRecord,
  ConversationTurnRecord,
  SubmittedInputContext,
} from './ConversationTypes';
import type {
  SpeechRecognitionProvider,
  TextToSpeechProvider,
} from './SpeechProviders';
import type { VisemeFrame } from './LipSyncTypes';
import type { ReasoningRuntime, ReasoningRuntimeCallbacks } from '../reasoning/ReasoningRuntime';
import type { ReasoningTurnHandle } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';
import type { ReasoningToolCall } from '../reasoning/ReasoningTypes';
import { ACTION_TOOL_DEFINITIONS, toolCallToActionRequest } from '../ai/IntentRegistry';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';
// [DEBUG-TEMP] remove this import and the one voiceDebugBus.emit() call in log() once real-mic verification is done.
import { voiceDebugBus } from './VoiceDebugBus';
import type { ActionRequest, ActionRequirement, ActionResult } from '../../shared/actions/ActionTypes';
import type { SessionContinuationHint } from '../../shared/conversation/ConversationSessionTypes';
import type { ProcessOutputEvent, ProcessExitEvent } from '../../shared/actions/ProcessTypes';
import type { WorkspaceObservationEvent } from '../../shared/actions/ExecutionLifecycle';
import type { CommunicationRuntimeEvent } from '../../shared/communication/CommunicationTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { ExecutionSupervisor } from './ExecutionSupervisor';

const MAX_LOG_ENTRIES = 200;
const MAX_TURN_RECORDS = 50;
/** How much of a background process's recent output stays visible in its live message — old lines silently drop off the top as new ones arrive. */
const PROCESS_MESSAGE_TAIL_CHARS = 4000;
/** Coalesces bursty process output (a build tool emitting hundreds of lines/sec) into one UI update at most this often per process. */
const PROCESS_OUTPUT_DEBOUNCE_MS = 200;
/** Hard backstop against a runaway tool-call/continuation loop within one turn, regardless of whether failures look related. */
const MAX_TOOL_ITERATIONS_PER_TURN = 10;
/** Recovery Policy: after this many consecutive failures that look like the same underlying problem, stop retrying that approach and make the model explain + ask instead. */
const MAX_SAME_FAILURE_ATTEMPTS = 3;
/** Friendly platform names for the proactive meeting-detected prompt — cosmetic only, the real medium id (used for start_communication_capture) always comes from the event itself. */
const MEETING_PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  webex: 'Webex',
  googleMeet: 'Google Meet',
};

/** Mutable state shared across a turn's initial stream and any tool-result continuations of it — plain object (not closures) so handleToolCall, several levels deep, can read/update the same buffers as the original streaming callbacks. */
type TurnContext = {
  ttsBuffer: string;
  finalResponse: string;
  assistantMessageId: string | null;
};

/** States where a new mic/typed input should interrupt whatever's in flight rather than being ignored. */
const INTERRUPTIBLE_STATES: ConversationState[] = ['speaking', 'thinking', 'performingAction', 'transcribing'];

function buildDefaultResponse(transcript: string) {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return 'I did not catch that.';
  }

  return `I heard: ${trimmed}`;
}

/**
 * What actually gets sent to the reasoning provider — the displayed/stored
 * transcript stays exactly what the user sees (their typed text, or a short
 * "📎 report.csv" for a file), while this carries the real content plus a
 * natural instruction when it arrived as pasted text or a file, so Paw
 * reads/summarizes it instead of answering as if it were a spoken command.
 */
function buildReasoningInput(transcript: string, context?: SubmittedInputContext, pendingImageCount?: number): string {
  const text = context?.reasoningText ?? transcript;
  if (context?.source === 'pasted') {
    return `[The user just pasted the text below into the conversation rather than typing a question or command. Do not call any tool/function for this message. Just reply in plain conversation: briefly summarize what it is, then ask what they'd like to do with it.]\n\n${text}`;
  }
  if (context?.source === 'file') {
    return `[The user just uploaded the file content below. Do not call any tool/function for this message — the file is already open in front of you as text, there is nothing to search for or open. Just reply in plain conversation: briefly summarize what it is, then ask what they'd like to do with it.]\n\n${text}`;
  }
  if (context?.source === 'image') {
    const total = pendingImageCount ?? 1;
    return `[The user just attached a reference image (a screenshot, mockup, logo, or design reference) — "${transcript}". This is Image ${total} of ${total} attached so far in the current task; every image attached stays available, none are lost. You cannot see its pixels directly. Call analyze_reference_image now to actually see what's in it before responding or building anything from it — never guess its layout, colors, or content. Pass imageIndex to look at one specific image (1-based, matching "Image 1," "Image 2," ...), or omit it to see the whole attached set together as one reference.]`;
  }
  return text;
}

/**
 * A plain "yes" to a pending confirmation question — deliberately narrow
 * (anchored to the start of the message) so it doesn't misfire on a reply
 * that merely contains "yes" somewhere inside a longer, unrelated message.
 */
const AFFIRMATIVE_REPLY = /^\s*(yes|yeah|yep|yup|sure|ok(ay)?|go ahead|do it|please do|confirmed?|proceed|sounds good)\b/i;

function isAffirmativeReply(text: string): boolean {
  return AFFIRMATIVE_REPLY.test(text.trim());
}

/** Sentence-ending punctuation followed by whitespace — a simple heuristic (not a full NLP tokenizer), good enough to pace speech naturally without waiting for a whole paragraph. */
const SENTENCE_BOUNDARY = /[.!?]+\s+/;

/** Pulls complete sentences off the front of a streaming text buffer, returning what's left to keep accumulating. */
function popCompleteSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  while (true) {
    const match = rest.match(SENTENCE_BOUNDARY);
    if (!match || match.index === undefined) break;
    const end = match.index + match[0].length;
    const sentence = rest.slice(0, end).trim();
    if (sentence) sentences.push(sentence);
    rest = rest.slice(end);
  }
  return { sentences, rest };
}

/**
 * The user talks to Paw, never to Gemini/OpenAI/Anthropic/whichever
 * provider happens to be configured — the provider is an implementation
 * detail. Every reasoning/STT/TTS provider bakes its own name into its
 * error strings (e.g. "Gemini request failed", "Whisper transcription
 * failed"); this is the one place all of those converge before reaching
 * the user-facing conversation panel, so it's the one place they get
 * stripped. The raw message is still kept for developers via failTurn's
 * turn-record/log() call, which feeds the (developer-only) debug log.
 */
function toUserFacingError(message: string): string {
  const looksProviderSpecific =
    /gemini|openai|anthropic|claude|whisper|elevenlabs|ollama|\brequest failed\b|\btranscription failed\b|\bplayback failed\b|\bhttp\s?\d{3}\b/i.test(
      message
    );
  if (!looksProviderSpecific) return message;
  return "Sorry, I'm having trouble responding right now. Please try again in a moment.";
}

/**
 * Owns the entire conversation lifecycle end to end — mic → STT → Gemini →
 * Action Engine → TTS → animation → back to idle — as a single explicit
 * state machine (see ConversationState in ConversationTypes.ts). Every
 * subsystem reports into this one runtime; nothing outside it decides what
 * the conversation is doing. Exactly one instance runs per companion
 * overlay, and turnId invalidates every in-flight callback the moment a
 * newer turn (or an interrupt) starts, so only one turn is ever "live".
 */
export class ConversationRuntime {
  private snapshot: ConversationSnapshot;
  private listeners = new Set<(snapshot: ConversationSnapshot) => void>();
  private recognitionSession: { stop: () => void; cancel: () => void } | null = null;
  private reasoningTurn: ReasoningTurnHandle | null = null;
  private turnId = 0;
  /**
   * Every reference image (screenshot/mockup/logo/product photo) attached
   * this session, in attachment order — appended, never overwritten, so a
   * batch of several images stays available as one reference set instead
   * of only the most recent one surviving. The model never sees the raw
   * bytes itself; analyze_reference_image resolves imageDataUrls from
   * here (one image via imageIndex, or the whole array), injected in
   * handleToolCall same as apiKey. 1-based indices (matching the "Image
   * 1, Image 2..." numbering shown to the model) map to index-1 here.
   */
  private pendingReferenceImages: string[] = [];
  /** Real, live getUserMedia/MediaRecorder capture handles, keyed by communicationId — started right after startCommunicationCapture succeeds, stopped (flushing real audio to disk) right before stopCommunicationCapture's plugin runs. Never more than one entry lives here per active recording. */
  private activeCommunicationCaptures = new Map<string, CaptureHandle>();
  private closed = true;

  /** Structured, dev-console-only debug log — never rendered in any UI. */
  private debugLog: ConversationLogEntry[] = [];
  /** Metadata for finished turns — in-memory only; the basis for future history/analytics, not surfaced anywhere yet. */
  private turnRecords: ConversationTurnRecord[] = [];
  private currentTurnRecord: ConversationTurnRecord | null = null;
  /** One Task Card per user request that actually did desktop work — see ConversationTaskRecord. Null for a turn that never called an action (plain Q&A). */
  private currentTaskRecord: ConversationTaskRecord | null = null;
  /** Which persisted session the next turn continues, once persistTurn resolves one — null means "let the store decide". */
  private activeSessionId: string | null = null;

  /** Sentence-sized chunks waiting to be spoken — lets Paw start talking as soon as the first sentence is ready instead of waiting for the whole reply. */
  private speechQueue: string[] = [];
  private speechQueueRunning = false;
  /** Resolves once the speech queue fully drains — handleTranscript awaits this instead of a single speak() call. */
  private speechQueuePromise: Promise<void> = Promise.resolve();
  /** True while a tool call has deliberately stopped speech mid-sentence to run an action — distinguishes that from a real playback error in the queue's catch. */
  private pausingSpeechForAction = false;
  /** Tool-call handlers currently in flight — handleTranscript's tail waits for these too, so a turn never finalizes while an action (and the speech it may resume) is still running. */
  private pendingActionPromises: Promise<void>[] = [];
  /** An action that came back needing confirmation — the next plain reply is checked against this before anything else, rather than trusting the model to remember and re-invoke the tool itself. */
  private pendingConfirmation: { request: ActionRequest; toolCall: ReasoningToolCall } | null = null;

  /** Recovery Policy bookkeeping — reset at the start of every new turn (startTurnRecord), NOT per continuation, so the caps apply across the whole chain of tool calls within one user turn. */
  private toolIterationCount = 0;
  private failureSignatureCounts = new Map<string, number>();

  /** One live-updating message per background process (started via start_process), independent of any single turn — a process can outlive many turns. */
  private processMessages = new Map<string, { messageId: string; tailBuffer: string }>();
  private processOutputDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Which in-flight task action a currently-running action's observe() events should update — keyed by action type since that's all workspace:observation carries. */
  private activeActionIdByType = new Map<string, string>();

  /** Coordinates action ordering/dedup/Work-History tracking — never reasons, never decides what runs next. See ExecutionSupervisor.ts. */
  private executionSupervisor = new ExecutionSupervisor((record) => {
    void this.args.persistExecution?.(record);
  });

  private handleWorkspaceObservation = (event: WorkspaceObservationEvent) => {
    const actionId = this.activeActionIdByType.get(event.actionType);
    if (!actionId) return;
    this.updateTaskActionProgress(actionId, event.event.message);
  };

  /**
   * Proactive Meeting Detection (desktop-first Communication Intelligence
   * Runtime) — the main process already only fires 'meetingDetected' for a
   * genuine new meeting, never a still-open one and never while already
   * recording that medium (see CommunicationRuntime.init()). This only
   * ever speaks up when the conversation is truly idle — never interrupts
   * an in-flight turn — and it only ever asks; the model decides whether
   * and how to call start_communication_capture once the user replies,
   * same as any other natural follow-up in this conversation.
   */
  private handleCommunicationRuntimeEvent = (event: CommunicationRuntimeEvent) => {
    if (event.type !== 'meetingDetected') return;
    if (this.closed || this.snapshot.state !== 'idle') return;
    const platform = MEETING_PLATFORM_DISPLAY_NAMES[event.medium] ?? event.medium;
    const text = `I detected a meeting — "${event.title}" on ${platform}. Would you like me to record this meeting?`;
    const turn = ++this.turnId;
    this.appendMessage('assistant', text);
    this.enqueueSpeech(text, turn);
    void this.speechQueuePromise.then(() => {
      if (turn === this.turnId && !this.closed) this.updateSnapshot({ state: 'idle' });
    });
  };

  private handleProcessOutput = (event: ProcessOutputEvent) => {
    let tracked = this.processMessages.get(event.processId);
    if (!tracked) {
      tracked = { messageId: uuidv4(), tailBuffer: '' };
      this.processMessages.set(event.processId, tracked);
    }
    tracked.tailBuffer = (tracked.tailBuffer + event.chunk).slice(-PROCESS_MESSAGE_TAIL_CHARS);

    if (this.processOutputDebounceTimers.has(event.processId)) return;
    const timer = setTimeout(() => {
      this.processOutputDebounceTimers.delete(event.processId);
      const current = this.processMessages.get(event.processId);
      if (!current) return;
      this.upsertMessage({
        id: current.messageId,
        role: 'assistant',
        content: `\`\`\`\n${current.tailBuffer.trim()}\n\`\`\``,
        createdAt: Date.now(),
        status: 'streaming',
      });
    }, PROCESS_OUTPUT_DEBOUNCE_MS);
    this.processOutputDebounceTimers.set(event.processId, timer);
  };

  private handleProcessExit = (event: ProcessExitEvent) => {
    const tracked = this.processMessages.get(event.processId);
    if (!tracked) return;

    const pendingTimer = this.processOutputDebounceTimers.get(event.processId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.processOutputDebounceTimers.delete(event.processId);
    }

    const statusLine =
      event.status === 'exited'
        ? `(process exited with code ${event.code})`
        : event.status === 'killed'
          ? '(process stopped)'
          : `(process crashed${event.code !== null ? ` — exit code ${event.code}` : ''})`;

    this.upsertMessage({
      id: tracked.messageId,
      role: 'assistant',
      content: `\`\`\`\n${tracked.tailBuffer.trim()}\n\`\`\`\n\n${statusLine}`,
      createdAt: Date.now(),
      status: 'final',
    });
    this.processMessages.delete(event.processId);
  };

  constructor(
    private args: {
      speechRecognition: SpeechRecognitionProvider;
      speechSynthesis: TextToSpeechProvider;
      reasoningRuntime: ReasoningRuntime;
      onStateChange?: (state: ConversationState) => void;
      /**
       * Executes an action the AI requested (via IPC to the main-process
       * ActionEngine). The AI only ever names an intent; PawOS decides how
       * — including independently enforcing confirmation for destructive
       * actions regardless of what's requested. Omitted entirely disables
       * tool use (chat-only), which is also the safe default.
       */
      executeAction?: (request: ActionRequest) => Promise<ActionResult>;
      /**
       * The Desktop Execution Engine's own pipeline stages, via IPC to the
       * matching plugin (see src/main/execution/). "Collect Missing
       * Information": if this returns any requirement, handleToolCall asks
       * the first one as a natural follow-up instead of executing blind.
       */
      checkActionRequirements?: (request: ActionRequest) => Promise<ActionRequirement[]>;
      /** The plugin's own "in progress" narration — e.g. "Opening VS Code…". Falls back to a generic phrase if omitted. */
      describeAction?: (request: ActionRequest) => Promise<string>;
      /** The plugin's own "done" narration — e.g. "I've opened VS Code." Falls back to a generic phrase if omitted. */
      reportActionResult?: (request: ActionRequest, result: ActionResult) => Promise<string>;
      /** Forwarded to the TTS provider's speak() call for lip-sync — only ever fires for providers whose supportsVisemes is true. */
      onVisemeFrame?: (frame: VisemeFrame) => void;
      /**
       * Persists a finished turn into Electron's session history (main
       * process) under the given hint. Voice and text turns both flow
       * through finalizeCurrentTurn(), so both land here identically —
       * there is no separate persistence path for either. Omitted entirely
       * disables history (turns still live in-memory via getConversationLog()).
       */
      persistTurn?: (turn: ConversationTurnRecord, hint: SessionContinuationHint) => Promise<{ id: string } | void>;
      /**
       * Persists one finished ExecutionRecord (Work History) into the main
       * process, built by the internal ExecutionSupervisor as each user
       * request concludes. Omitted entirely disables Work History (the
       * Supervisor's queue/dedup/tracking still run — only persistence is skipped).
       */
      persistExecution?: (record: ExecutionRecord) => Promise<void> | void;
      /**
       * "Automatic Session Detection" — called once, for the first turn
       * persisted since this runtime was created (activeSessionId is still
       * unknown), to decide whether this message continues one of the
       * user's recent sessions or starts a new one. Every later turn in the
       * same runtime lifetime already knows its session and skips this.
       * Omitted (or erroring) falls back to the store's own 'auto' heuristic.
       */
      resolveSession?: (transcript: string) => Promise<SessionContinuationHint>;
      /**
       * Subscribes to live output/exit push events from ProcessManager (main)
       * for anything started via start_process — each event updates one
       * growing message per processId until the process exits. Subscribed
       * once for the lifetime of this runtime; omitted disables live display
       * (the model can still pull output on demand via get_process_output).
       */
      onProcessOutput?: (cb: (event: ProcessOutputEvent) => void) => void;
      onProcessExit?: (cb: (event: ProcessExitEvent) => void) => void;
      /**
       * Intermediate signals a plugin's observe() yields mid-action (main
       * process, via DesktopExecutionEngine) — updates the same in-progress
       * narration message live instead of it sitting static ("Installing…")
       * until the whole action finishes.
       */
      onWorkspaceObservation?: (cb: (event: WorkspaceObservationEvent) => void) => void;
      /**
       * Subscribes to Communication Runtime push events (main process) —
       * used here only for proactive meeting-detected prompts; the
       * Communication Workspace subscribes to the same channel separately
       * for its own live regions. Omitted disables the proactive prompt
       * (the user can still say "start recording" directly).
       */
      onCommunicationEvent?: (cb: (event: CommunicationRuntimeEvent) => void) => void;
    }
  ) {
    this.snapshot = {
      panelOpen: false,
      state: 'idle',
      messages: [],
      draftTranscript: '',
      errorMessage: null,
      supportsSpeechRecognition: args.speechRecognition.isSupported(),
      supportsSpeechSynthesis: args.speechSynthesis.isSupported(),
    };

    if (args.executeAction) {
      this.args.reasoningRuntime.setTools(ACTION_TOOL_DEFINITIONS);
    }

    args.onProcessOutput?.(this.handleProcessOutput);
    args.onProcessExit?.(this.handleProcessExit);
    args.onWorkspaceObservation?.(this.handleWorkspaceObservation);
    args.onCommunicationEvent?.(this.handleCommunicationRuntimeEvent);
  }

  subscribe(listener: (snapshot: ConversationSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  /** Recent finished turns with full metadata (id/timing/transcript/actions/errors/model/voice) — for future history/analytics UI. Not read anywhere yet. */
  getConversationLog(): ConversationTurnRecord[] {
    return [...this.turnRecords];
  }

  /** Recent structured runtime events, for debugging only — deliberately not exposed in any user-facing surface. */
  getDebugLog(): ConversationLogEntry[] {
    return [...this.debugLog];
  }

  setReasoningProvider(provider: ReasoningProvider) {
    this.args.reasoningRuntime.setProvider(provider);
  }

  /** Swaps the STT backend at runtime (e.g. once an API key finishes loading after mount) without recreating the whole runtime. */
  setSpeechRecognitionProvider(provider: SpeechRecognitionProvider) {
    this.args.speechRecognition = provider;
    this.updateSnapshot({ supportsSpeechRecognition: provider.isSupported() });
  }

  /** Swaps the TTS backend at runtime — e.g. when the active companion profile's voice provider/voiceId/speed changes. */
  setSpeechSynthesisProvider(provider: TextToSpeechProvider) {
    this.args.speechSynthesis.stop();
    this.args.speechSynthesis = provider;
    this.updateSnapshot({ supportsSpeechSynthesis: provider.isSupported() });
  }

  setReasoningSystemPrompt(systemPrompt: string) {
    this.args.reasoningRuntime.setSystemPrompt(systemPrompt);
  }

  open() {
    this.closed = false;

    if (INTERRUPTIBLE_STATES.includes(this.snapshot.state)) {
      this.interrupt('user requested to talk while Paw was busy');
      return;
    }

    if (this.snapshot.state === 'listening') {
      this.updateSnapshot({ panelOpen: true });
      return;
    }

    this.updateSnapshot({
      panelOpen: true,
      errorMessage: null,
    });
    void this.beginListening();
  }

  /**
   * Speak text without starting speech recognition or modifying conversation history.
   * Intended for first-launch/UX announcements.
   */
  async speak(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Ensure we don’t accidentally run reasoning or STT.
    this.speechQueue = [];
    this.args.speechSynthesis.stop();
    this.updateSnapshot({
      // keep panel open state unchanged; only reflect speaking state
      state: 'speaking',
      errorMessage: null,
      draftTranscript: '',
    });

    try {
      await this.speakResponse(trimmed);
    } catch (error) {
      this.failTurn(error instanceof Error ? error.message : 'Speech synthesis failed.');
      return;
    }

    if (this.closed) {
      return;
    }

    this.reasoningTurn = null;
    this.updateSnapshot({
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }

  close() {
    this.closed = true;
    this.turnId += 1;
    this.stopRecognition();
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.speechQueue = [];
    this.pendingConfirmation = null;
    this.args.speechSynthesis.stop();
    this.finalizeCurrentTurn('interrupted', 'panel closed mid-turn');
    this.updateSnapshot({
      panelOpen: false,
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }

  toggle() {
    if (this.snapshot.panelOpen) {
      this.close();
      return;
    }

    this.open();
  }

  submitTranscript(transcript: string, context?: SubmittedInputContext) {
    const trimmed = transcript.trim();
    if (!trimmed) {
      return;
    }

    this.closed = false;

    // A "yes" to a pending confirmation must survive even if Paw is still
    // mid-speech finishing the confirmation question itself — checked before
    // the barge-in reset below, which would otherwise clear pendingConfirmation
    // out from under it. Confirmed directly: a real race when the reply
    // arrives before TTS for the question finishes speaking, which is the
    // common case (the user replies as soon as they hear "should I go
    // ahead?", often before the sentence is fully spoken). Stops any leftover
    // speech itself, same as the barge-in path below, without treating this
    // as an interruption (handleTranscript's own pendingConfirmation branch
    // already bumps turnId and starts a fresh turn record for it).
    if (this.pendingConfirmation && !context && isAffirmativeReply(trimmed)) {
      this.speechQueue = [];
      this.args.speechSynthesis.stop();
      this.appendMessage('user', trimmed);
      void this.handleTranscript(trimmed, context);
      return;
    }

    if (INTERRUPTIBLE_STATES.includes(this.snapshot.state)) {
      // Barge-in via typed input — same interrupt as the Listen button, just
      // skipping straight to handling this transcript instead of opening
      // the mic. Bumping turnId first means any pending rejection from
      // stopping speech mid-utterance (see handleTranscript's catch) is
      // recognized as stale instead of clobbering the state we're about to enter.
      this.turnId += 1;
      this.reasoningTurn?.cancel();
      this.reasoningTurn = null;
      this.speechQueue = [];
      this.pendingConfirmation = null;
      this.args.speechSynthesis.stop();
      this.finalizeCurrentTurn('interrupted', 'typed barge-in');
      this.log('interrupted', { reason: 'typed barge-in' });
    }
    if (this.snapshot.state !== 'listening') {
      this.updateSnapshot({
        state: 'listening',
        errorMessage: null,
      });
    }
    this.appendMessage('user', trimmed);
    void this.handleTranscript(trimmed, context);
  }

  cancel() {
    this.turnId += 1;
    this.stopRecognition();
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.speechQueue = [];
    this.pendingConfirmation = null;
    this.args.speechSynthesis.stop();
    this.finalizeCurrentTurn('interrupted', 'cancelled');
    this.updateSnapshot({
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }

  /** Stops whatever's in flight (speech, reasoning, recognition) and starts listening fresh — the one path every barge-in goes through. */
  private interrupt(reason: string): void {
    this.turnId += 1;
    this.stopRecognition();
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.speechQueue = [];
    this.pendingConfirmation = null;
    this.args.speechSynthesis.stop();
    this.finalizeCurrentTurn('interrupted', reason);
    this.log('interrupted', { reason });
    this.updateSnapshot({ state: 'interrupted', panelOpen: true, errorMessage: null });
    void this.beginListening();
  }

  private async beginListening() {
    if (this.closed) {
      return;
    }

    if (!this.args.speechRecognition.isSupported()) {
      // Distinct from a denied permission — the API itself isn't there.
      // Previously reported as 'waitingForPermission' with no message at
      // all, which is both the wrong state and silent about why.
      this.log('speech-recognition-unsupported');
      this.updateSnapshot({
        state: 'error',
        errorMessage: 'Speech recognition is not available — type your message instead.',
      });
      return;
    }

    this.updateSnapshot({
      state: 'listening',
      draftTranscript: '',
      errorMessage: null,
    });

    const currentTurn = ++this.turnId;
    try {
      this.recognitionSession = await this.args.speechRecognition.start({
        onPartialTranscript: (text) => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.updateSnapshot({ draftTranscript: text });
        },
        onFinalTranscript: (text) => {
          if (this.closed || currentTurn !== this.turnId) return;
          const finalTranscript = text.trim();
          if (!finalTranscript) {
            return;
          }
          this.appendMessage('user', finalTranscript);
          void this.handleTranscript(finalTranscript);
        },
        onPermissionDenied: () => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.updateSnapshot({
            state: 'waitingForPermission',
            errorMessage: 'Speech recognition permission is required.',
          });
        },
        onEnd: () => {
          if (this.closed || currentTurn !== this.turnId) return;
          if (this.snapshot.state === 'listening') {
            this.updateSnapshot({
              state: 'idle',
              draftTranscript: '',
            });
          }
        },
        onError: (error) => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.failTurn(error.message);
        },
      });
    } catch (error) {
      this.failTurn(error instanceof Error ? error.message : 'Speech recognition failed.');
    }
  }

  private stopRecognition() {
    this.recognitionSession?.cancel();
    this.recognitionSession = null;
  }

  private async handleTranscript(transcript: string, context?: SubmittedInputContext) {
    if (this.closed) {
      return;
    }

    // A plain reply to a pending confirmation ("Yes, go ahead.") is handled
    // deterministically here rather than trusting the model to remember and
    // re-invoke the same tool call itself — real testing showed that
    // trusting the model alone was not reliable. Pasted/file input is never
    // treated as a confirmation reply — that's new content, not a yes/no answer.
    if (this.pendingConfirmation && !context) {
      const pending = this.pendingConfirmation;
      this.pendingConfirmation = null;
      if (isAffirmativeReply(transcript)) {
        const currentTurn = ++this.turnId;
        this.stopRecognition();
        this.startTurnRecord(transcript);
        this.pendingActionPromises = [];
        this.log('turn-start', { turnId: currentTurn, transcript, source: 'confirmation-reply' });
        void this.executeConfirmedAction(pending.request, pending.toolCall, currentTurn);
        return;
      }
      // Not a clear yes — treat the confirmation as abandoned and handle
      // this message normally below (the user may have changed their mind
      // or moved on to something else entirely).
    }

    const currentTurn = ++this.turnId;
    this.stopRecognition();
    this.startTurnRecord(transcript);
    this.pendingActionPromises = [];
    this.log('turn-start', { turnId: currentTurn, transcript, source: context?.source ?? 'typed' });

    if (context?.source === 'image' && context.imageDataUrl) {
      this.pendingReferenceImages.push(context.imageDataUrl);
    }

    // Voice and typing feed the same reasoning input unchanged; pasted text
    // and uploaded files get a natural instruction prefix so Paw reads and
    // summarizes them instead of treating a content dump as a spoken
    // command — the displayed/stored transcript above stays untouched.
    const reasoningInput = buildReasoningInput(transcript, context, this.pendingReferenceImages.length);

    this.updateSnapshot({
      state: 'transcribing',
      draftTranscript: transcript,
      errorMessage: null,
    });

    // No artificial delay here — push-to-talk should feel instant. The
    // transcribing→thinking transition happens as fast as JS allows; real
    // latency (STT, reasoning) is the only wait the user should ever feel.
    this.updateSnapshot({
      state: 'thinking',
      errorMessage: null,
    });

    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.log('generating-response');

    let turnFailed = false;
    let turnHandle: ReasoningTurnHandle;
    // Shared with handleToolCall/continueReasoningTurn — a tool-result
    // continuation streams into the SAME buffers as this initial call.
    const turnContext: TurnContext = { ttsBuffer: '', finalResponse: '', assistantMessageId: null };

    try {
      turnHandle = this.args.reasoningRuntime.runTurn(reasoningInput, this.buildStreamCallbacks(currentTurn, turnContext));
      this.reasoningTurn = turnHandle;

      const result = await turnHandle.completed;
      turnContext.finalResponse = result.response || result.assistantMessage?.content || turnContext.finalResponse;
    } catch (error) {
      if (this.closed || currentTurn !== this.turnId || turnFailed) {
        return;
      }
      this.failTurn(error instanceof Error ? error.message : 'Failed to compose a response.');
      return;
    }

    if (this.closed || currentTurn !== this.turnId) {
      return;
    }

    await this.drainPendingActionsAndFinalize(currentTurn, turnContext, transcript);
  }

  /**
   * A tool call's action — and any tool-result continuation it triggers
   * (see handleToolCall/continueReasoningTurn) — can still be running
   * after the initial stream finishes, and that continuation can itself
   * trigger a FURTHER tool call, pushing a new promise onto
   * pendingActionPromises while the current batch is still being awaited.
   * A single Promise.all(...) only captures a snapshot at the moment it's
   * called, so a promise pushed mid-await is silently never waited on —
   * confirmed directly: this let finalizeCurrentTurn (and the Task Card it
   * finalizes) fire while a later chained action was still executing,
   * splitting one user request across two Task Cards. Draining in a loop
   * (checking again after each batch resolves) catches whatever got
   * pushed during that batch, however deep the tool-call chain goes.
   *
   * Shared by the normal transcript path and executeConfirmedAction — a
   * confirmed action's continuation can itself chain further tool calls
   * (pushed onto pendingActionPromises by buildStreamCallbacks), and those
   * need the exact same draining + finalize logic to ever actually finish
   * the turn instead of leaving it open.
   */
  private async drainPendingActionsAndFinalize(currentTurn: number, ctx: TurnContext, transcriptForDefault: string): Promise<void> {
    await this.speechQueuePromise;
    while (this.pendingActionPromises.length > 0) {
      const batch = this.pendingActionPromises;
      this.pendingActionPromises = [];
      await Promise.all(batch);
      await this.speechQueuePromise;
    }

    if (this.closed || currentTurn !== this.turnId || !this.currentTurnRecord) {
      // Either superseded, or the speech queue already failed the turn
      // itself (via failTurn) — don't overwrite that with 'completed'.
      return;
    }

    if (!ctx.finalResponse) {
      // Nothing streamed at all, even after any continuation (e.g. a
      // tool-call-only turn whose result needed no further comment) — still
      // say something, and make sure the visible chat bubble matches what's
      // spoken instead of staying empty.
      ctx.finalResponse = buildDefaultResponse(transcriptForDefault);
      if (ctx.assistantMessageId) {
        this.upsertMessage({
          id: ctx.assistantMessageId,
          role: 'assistant',
          content: ctx.finalResponse,
          createdAt: Date.now(),
          status: 'final',
        });
      } else {
        this.appendMessage('assistant', ctx.finalResponse);
      }
      this.enqueueSpeech(ctx.finalResponse, currentTurn);
      await this.speechQueuePromise;
    }

    if (this.closed || currentTurn !== this.turnId || !this.currentTurnRecord) {
      return;
    }

    this.currentTurnRecord.assistantResponse = ctx.finalResponse;
    this.log('starting-tts', { textLength: ctx.finalResponse.length });

    this.reasoningTurn = null;
    this.finalizeCurrentTurn('completed');
    this.updateSnapshot({ state: 'completed', draftTranscript: '' });
    this.updateSnapshot({ state: 'idle' });
  }

  /** Enqueues a sentence-sized chunk to be spoken, starting the speech queue if it isn't already running. */
  private enqueueSpeech(text: string, currentTurn: number): void {
    const trimmed = text.trim();
    if (!trimmed || this.closed || currentTurn !== this.turnId) return;
    this.speechQueue.push(trimmed);
    if (!this.speechQueueRunning) {
      this.speechQueuePromise = this.runSpeechQueue(currentTurn);
    }
  }

  /** Speaks queued sentences one at a time, in order, until the queue drains — the "think out loud" pacing lives entirely here. */
  private async runSpeechQueue(currentTurn: number): Promise<void> {
    this.speechQueueRunning = true;
    if (currentTurn === this.turnId && !this.closed && this.snapshot.state !== 'speaking') {
      this.updateSnapshot({ state: 'speaking', draftTranscript: '' });
    }

    while (this.speechQueue.length > 0) {
      if (this.closed || currentTurn !== this.turnId) {
        this.speechQueue = [];
        break;
      }
      const next = this.speechQueue.shift()!;
      try {
        await this.speakResponse(next);
      } catch (error) {
        if (this.closed || currentTurn !== this.turnId || this.pausingSpeechForAction) {
          // Stale barge-in rejection, or a deliberate pause to run an
          // action (see handleToolCall) — neither is a real failure.
          break;
        }
        this.speechQueue = [];
        this.speechQueueRunning = false;
        this.failTurn(error instanceof Error ? error.message : 'Speech synthesis failed.');
        return;
      }
    }

    this.speechQueueRunning = false;
  }

  /** Resumes speaking whatever was still queued after a tool call paused it, or returns to 'thinking' if nothing's left to say. */
  private resumeAfterAction(currentTurn: number): void {
    this.pausingSpeechForAction = false;
    if (currentTurn !== this.turnId) return;
    if (this.speechQueue.length > 0) {
      this.speechQueuePromise = this.runSpeechQueue(currentTurn);
    } else {
      this.updateSnapshot({ state: 'thinking' });
    }
  }

  private async speakResponse(text: string): Promise<void> {
    await this.args.speechSynthesis.speak(text, { onVisemeFrame: this.args.onVisemeFrame });
  }

  private failTurn(message: string) {
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.speechQueue = [];
    this.args.speechSynthesis.stop();
    // The raw, provider-specific message is kept for developers — it's what
    // the turn record, structured log, and (today) the Debug Voice panel
    // see. The user only ever sees the sanitized version below: Paw talks
    // to the user, never Gemini/OpenAI/Anthropic/etc. — see toUserFacingError().
    if (this.currentTurnRecord) this.currentTurnRecord.errors.push(message);
    this.finalizeCurrentTurn('error', message);
    this.updateSnapshot({
      state: 'error',
      errorMessage: toUserFacingError(message),
    });
  }

  /**
   * The streaming callback wiring shared by the turn's initial runTurn() call
   * and any later continueTurn() calls after a tool result — both write into
   * the SAME turnContext buffers, so a continuation's real narration ends up
   * exactly where the initial call's would have (same message id semantics,
   * same speech queue).
   */
  private buildStreamCallbacks(currentTurn: number, ctx: TurnContext): ReasoningRuntimeCallbacks {
    return {
      onDelta: (delta, assistantMessage) => {
        if (this.closed || currentTurn !== this.turnId) return;
        this.upsertMessage({
          id: assistantMessage.id,
          role: 'assistant',
          content: assistantMessage.content,
          createdAt: assistantMessage.createdAt,
          status: assistantMessage.status,
        });

        // Paw should think out loud, not wait for the whole reply — speak
        // each sentence as soon as it's complete instead of the entire
        // response at once.
        ctx.ttsBuffer += delta;
        const { sentences, rest } = popCompleteSentences(ctx.ttsBuffer);
        ctx.ttsBuffer = rest;
        for (const sentence of sentences) this.enqueueSpeech(sentence, currentTurn);
      },
      onComplete: (result) => {
        if (this.closed || currentTurn !== this.turnId) return;
        ctx.finalResponse = result.response || result.assistantMessage?.content || ctx.finalResponse;
        if (result.assistantMessage) {
          ctx.assistantMessageId = result.assistantMessage.id;
          this.upsertMessage({
            id: result.assistantMessage.id,
            role: 'assistant',
            content: result.assistantMessage.content,
            createdAt: result.assistantMessage.createdAt,
            status: 'final',
          });
        }
        // Whatever's left in the buffer never hit a sentence boundary
        // (e.g. a short reply with no trailing punctuation) — say it anyway.
        const leftover = ctx.ttsBuffer.trim();
        ctx.ttsBuffer = '';
        if (leftover) this.enqueueSpeech(leftover, currentTurn);
      },
      onToolCall: (toolCall) => {
        if (this.closed || currentTurn !== this.turnId) return;
        this.pendingActionPromises.push(this.handleToolCall(toolCall, currentTurn, ctx));
      },
      onError: (error) => {
        if (this.closed || currentTurn !== this.turnId) return;
        this.failTurn(error.message);
      },
    };
  }

  /**
   * Recovery Policy bookkeeping. Returns whether the model should be given
   * another continueTurn() to react to this result. A hard cap
   * (MAX_TOOL_ITERATIONS_PER_TURN) always wins regardless of what the
   * failures look like; below that, repeated failures that look like the
   * same underlying problem (same action type + same message) get one
   * injected "stop retrying, explain, and ask" nudge, and if the model
   * tries the identical thing again anyway after that, continuation stops
   * entirely rather than nudging forever.
   */
  private recordToolOutcomeAndCheckBudget(request: ActionRequest, result: ActionResult): boolean {
    this.toolIterationCount += 1;
    if (this.toolIterationCount >= MAX_TOOL_ITERATIONS_PER_TURN) return false;
    if (result.ok) return true;

    const signature = `${request.type}|${(result.message ?? result.reason ?? '').slice(0, 200)}`;
    const count = (this.failureSignatureCounts.get(signature) ?? 0) + 1;
    this.failureSignatureCounts.set(signature, count);

    if (count === MAX_SAME_FAILURE_ATTEMPTS) {
      this.args.reasoningRuntime.appendSystemMessage(
        `The last ${count} attempts at this failed the same way (${request.type}: ${(result.message ?? '').slice(0, 150)}). Stop retrying this approach now — explain the remaining problem to the user in plain language, show what you tried and what actually happened, and ask how they'd like to proceed instead of trying again.`
      );
      return true; // one more continuation, so the model can actually produce that explanation
    }
    if (count > MAX_SAME_FAILURE_ATTEMPTS) {
      return false; // already told it to stop, and it tried the identical thing again — don't feed it another round
    }
    return true;
  }

  /** Lets the model react to a tool result already recorded via provideToolResult — no new user input, just a continuation of the current turn. */
  private async continueReasoningTurn(currentTurn: number, ctx: TurnContext): Promise<void> {
    if (this.closed || currentTurn !== this.turnId) return;
    this.updateSnapshot({ state: 'thinking' });

    const handle = this.args.reasoningRuntime.continueTurn(this.buildStreamCallbacks(currentTurn, ctx));
    this.reasoningTurn = handle;
    try {
      const result = await handle.completed;
      if (this.closed || currentTurn !== this.turnId) return;
      ctx.finalResponse = result.response || result.assistantMessage?.content || ctx.finalResponse;
    } catch (error) {
      if (this.closed || currentTurn !== this.turnId) return;
      this.failTurn(error instanceof Error ? error.message : 'Failed to continue after that.');
    }
  }

  private async handleToolCall(toolCall: ReasoningToolCall, currentTurn: number, ctx: TurnContext) {
    const executeAction = this.args.executeAction;
    if (!executeAction) return;

    const request = toolCallToActionRequest(toolCall);
    if (!request) {
      this.appendMessage('system', "I'm not sure how to do that yet.");
      return;
    }

    // Vision-backed actions always use Gemini regardless of the active
    // chat provider (same internal-Gemini precedent as AIRouter's other
    // vision-backed helpers) — the model never supplies its own key, and
    // analyzeReferenceImage never receives raw image bytes from the
    // model (it can't produce them) — resolved here from every image
    // attached this session: a valid 1-based imageIndex picks one
    // specific image, omitted means the whole attached set together.
    if (request.type === 'analyzeReferenceImage') {
      request.apiKey = aiProviderConfigStore.getApiKey('gemini');
      const index = request.imageIndex;
      const picked =
        typeof index === 'number' && index >= 1 && index <= this.pendingReferenceImages.length
          ? this.pendingReferenceImages[index - 1]
          : undefined;
      request.imageDataUrls = picked !== undefined ? [picked] : this.pendingReferenceImages;
    }
    if (request.type === 'generateAltText' || request.type === 'verifyRenderedUi') {
      request.apiKey = aiProviderConfigStore.getApiKey('gemini');
    }
    // Communication Intelligence Runtime — the same "always Gemini,
    // injected here, never model-supplied" precedent as every other
    // AI-backed action above.
    if (request.type === 'processCommunication' || request.type === 'searchCommunications' || request.type === 'resumeInterruptedCommunications' || request.type === 'draftFollowupEmail') {
      request.apiKey = aiProviderConfigStore.getApiKey('gemini');
    }

    // Real mic/system-audio capture lives in THIS renderer process
    // (getUserMedia/MediaRecorder can't run in the main process) — the
    // plugin itself only manages the CommunicationRecord's metadata/
    // status. Stopping must flush real audio to disk BEFORE the plugin
    // marks the record 'processing', so processCommunication always has
    // real bytes to transcribe (never a race where processing starts
    // before the file exists).
    if (request.type === 'stopCommunicationCapture') {
      const handle = this.activeCommunicationCaptures.get(request.communicationId);
      if (handle) {
        const saveResult = await handle.stop().catch((error: Error) => ({ ok: false, message: error.message }));
        this.activeCommunicationCaptures.delete(request.communicationId);
        if (!saveResult.ok) {
          this.log('communication-capture-save-failed', { communicationId: request.communicationId, message: saveResult.message });
        }
      }
    }

    // "Collect Missing Information" — ask instead of executing blind or
    // failing silently. Only the first missing requirement is asked at a
    // time; the user's reply becomes the next turn's transcript, same
    // pipeline as everything else.
    const missing = await this.args.checkActionRequirements?.(request).catch(() => []) ?? [];
    if (missing.length > 0) {
      this.appendMessage('assistant', missing[0].message);
      this.log('action-needs-info', { name: toolCall.name, requirement: missing[0].id });
      this.resumeAfterAction(currentTurn);
      return;
    }

    // Tool calls can genuinely arrive mid-sentence now that speech is
    // chunked — pause whatever's playing rather than talking over the action.
    if (this.snapshot.state === 'speaking') {
      this.pausingSpeechForAction = true;
      this.args.speechSynthesis.stop();
    }
    if (currentTurn === this.turnId) this.updateSnapshot({ state: 'performingAction' });
    this.log('action-start', { name: toolCall.name, type: request.type });

    // One Task Card narrates the whole request live, one action entry at a
    // time — never a chat line per action. Starts as "Opening VS Code…" and
    // updates in place to "I've opened VS Code." (or the honest failure
    // phrasing) once the result lands, so the user is never staring at
    // silence while something runs. Never execute an action silently. The
    // phrasing itself belongs to whichever plugin owns this request type
    // (src/main/execution/plugins/) — this runtime never hardcodes it. Also
    // registered so live observe() events (workspace:observation) can
    // update this same action entry while it's still in flight.
    const actionStartedAt = Date.now();
    const inProgressText = await this.args.describeAction?.(request).catch(() => null) ?? 'Working on that…';
    const actionId = this.startTaskAction(request, inProgressText);

    // Duplicate check first (skips the queue entirely — nothing to order if
    // it's not going to run again), then real actions are ordered through
    // the Execution Queue so a burst of tool calls in one streamed response
    // can never race each other's OS effects.
    let result: ActionResult;
    try {
      const duplicate = this.executionSupervisor.findDuplicate(request);
      result =
        duplicate ??
        (await this.executionSupervisor.queue.runExclusive(request, async (item) => {
          item.state = 'running';
          const r = await executeAction(request);
          item.state = r.ok ? 'completed' : 'failed';
          return r;
        }));
    } catch (error) {
      this.activeActionIdByType.delete(request.type);
      const message = error instanceof Error ? error.message : 'Action failed unexpectedly.';
      if (this.currentTurnRecord) this.currentTurnRecord.errors.push(message);
      const failure: ActionResult = { ok: false, reason: 'failed', message };
      this.finishTaskAction(actionId, failure, 'Something went wrong while I was doing that.');
      this.executionSupervisor.recordAction(request, failure, {
        label: 'Something went wrong while I was doing that.',
        startedAt: actionStartedAt,
        endedAt: Date.now(),
      });
      this.log('action-error', { name: toolCall.name, message });
      await this.recordAndMaybeContinueAfterTool(toolCall, request, failure, currentTurn, ctx);
      return;
    }
    this.activeActionIdByType.delete(request.type);

    await this.maybeStartRealCommunicationCapture(request, result);

    if (this.currentTurnRecord) {
      this.currentTurnRecord.actionsExecuted.push({ type: request.type, ok: result.ok, label: toolCall.name });
    }
    this.log('action-complete', { name: toolCall.name, ok: result.ok });

    // Remember this exact request so a plain "yes" on the next turn can
    // complete it directly — see the interception at the top of
    // handleTranscript. Not trusted to the model re-invoking the tool itself.
    if (!result.ok && result.reason === 'requires-confirmation') {
      this.pendingConfirmation = { request, toolCall };
    }

    const doneText =
      (await this.args.reportActionResult?.(request, result).catch(() => null)) ??
      (result.ok ? 'Done.' : "I couldn't finish that.");
    this.finishTaskAction(actionId, result, doneText);
    this.executionSupervisor.recordAction(request, result, { label: doneText, startedAt: actionStartedAt, endedAt: Date.now() });

    await this.recordAndMaybeContinueAfterTool(toolCall, request, result, currentTurn, ctx);
  }

  /**
   * Feeds the real result back to the model (tool-result round-trip) and,
   * within the Recovery Policy's budget, lets it react before this tool
   * call is considered finished — e.g. read real stderr and retry a fix,
   * rather than the call being fire-and-forget as it was before this existed.
   */
  private async recordAndMaybeContinueAfterTool(
    toolCall: ReasoningToolCall,
    request: ActionRequest,
    result: ActionResult,
    currentTurn: number,
    ctx: TurnContext
  ): Promise<void> {
    this.args.reasoningRuntime.provideToolResult({
      toolCallId: toolCall.id,
      name: toolCall.name,
      content: JSON.stringify(result),
    });

    const shouldContinue = this.recordToolOutcomeAndCheckBudget(request, result);
    this.resumeAfterAction(currentTurn);

    if (shouldContinue && !this.closed && currentTurn === this.turnId) {
      await this.continueReasoningTurn(currentTurn, ctx);
    }
  }

  /**
   * Completes a previously-refused action after the user's plain "yes" —
   * same narration/execute/report pipeline as handleToolCall, just entered
   * from a confirmation reply instead of a tool call. Critically, this
   * ALSO feeds the real result back to the model and lets it continue
   * (recordAndMaybeContinueAfterTool, same as the normal tool-call path) —
   * without this, a multi-step goal stalls after the first confirmed step
   * because the model is never told the action actually happened and has
   * no chance to decide the next step itself. The confirmation reply text
   * itself is still never sent to the model (see the intentional
   * isAffirmativeReply handling in handleTranscript) — this only concerns
   * what happens AFTER the confirmed action has already finished executing.
   */
  private async executeConfirmedAction(request: ActionRequest, toolCall: ReasoningToolCall, currentTurn: number): Promise<void> {
    const executeAction = this.args.executeAction;
    if (!executeAction) return;

    if (currentTurn === this.turnId) this.updateSnapshot({ state: 'performingAction' });
    this.log('action-start', { type: request.type, confirmed: true });

    // A fresh turn (started in handleTranscript's confirmation branch), so
    // it gets its own buffers — same shape as the initial runTurn's, and
    // shared with any tool calls this continuation itself triggers.
    const ctx: TurnContext = { ttsBuffer: '', finalResponse: '', assistantMessageId: null };

    const actionStartedAt = Date.now();
    const inProgressText = await this.args.describeAction?.(request).catch(() => null) ?? 'Working on that…';
    const actionId = this.startTaskAction(request, inProgressText);

    const confirmedRequest = { ...request, confirmed: true } as ActionRequest;
    let result: ActionResult;
    try {
      const duplicate = this.executionSupervisor.findDuplicate(confirmedRequest);
      result =
        duplicate ??
        (await this.executionSupervisor.queue.runExclusive(confirmedRequest, async (item) => {
          item.state = 'running';
          const r = await executeAction(confirmedRequest);
          item.state = r.ok ? 'completed' : 'failed';
          return r;
        }));
    } catch (error) {
      this.activeActionIdByType.delete(request.type);
      const message = error instanceof Error ? error.message : 'Action failed unexpectedly.';
      if (this.currentTurnRecord) this.currentTurnRecord.errors.push(message);
      const failure: ActionResult = { ok: false, reason: 'failed', message };
      this.finishTaskAction(actionId, failure, 'Something went wrong while I was doing that.');
      this.executionSupervisor.recordAction(confirmedRequest, failure, {
        label: 'Something went wrong while I was doing that.',
        startedAt: actionStartedAt,
        endedAt: Date.now(),
      });
      this.log('action-error', { message });
      await this.recordAndMaybeContinueAfterTool(toolCall, confirmedRequest, failure, currentTurn, ctx);
      await this.drainPendingActionsAndFinalize(currentTurn, ctx, 'yes');
      return;
    }
    this.activeActionIdByType.delete(request.type);

    // startCommunicationCapture is always confirmed (see
    // DESTRUCTIVE_ACTION_TYPES), so this confirmed-retry path — not the
    // initial handleToolCall pass — is where real capture actually needs
    // to start.
    await this.maybeStartRealCommunicationCapture(confirmedRequest, result);

    if (this.currentTurnRecord) {
      this.currentTurnRecord.actionsExecuted.push({ type: request.type, ok: result.ok, label: request.type });
    }
    this.log('action-complete', { type: request.type, ok: result.ok });

    const doneText =
      (await this.args.reportActionResult?.(request, result).catch(() => null)) ??
      (result.ok ? 'Done.' : "I couldn't finish that.");
    this.finishTaskAction(actionId, result, doneText);
    this.executionSupervisor.recordAction(confirmedRequest, result, { label: doneText, startedAt: actionStartedAt, endedAt: Date.now() });

    await this.recordAndMaybeContinueAfterTool(toolCall, confirmedRequest, result, currentTurn, ctx);
    await this.drainPendingActionsAndFinalize(currentTurn, ctx, 'yes');
  }

  private appendMessage(role: 'system' | 'user' | 'assistant', content: string, status: 'final' | 'streaming' = 'final') {
    this.upsertMessage({
      id: uuidv4(),
      role,
      content,
      createdAt: Date.now(),
      status,
    });
  }

  private upsertMessage(message: ConversationMessage) {
    const messages = this.snapshot.messages.some((item) => item.id === message.id)
      ? this.snapshot.messages.map((item) => (item.id === message.id ? message : item))
      : [...this.snapshot.messages, message];

    this.updateSnapshot({
      messages,
    });
  }

  /**
   * One Task Card per user request, not one chat line per action — the
   * conversation stays a human-readable summary while every real step
   * (command, path, output, verification, error, recovery) lives on the
   * card's own record for the Task Details panel. Created lazily on the
   * first action a turn actually calls; a turn that never calls one (plain
   * Q&A) never gets a card.
   */
  private ensureCurrentTask(): ConversationTaskRecord {
    if (!this.currentTaskRecord) {
      this.currentTaskRecord = {
        id: uuidv4(),
        goal: this.currentTurnRecord?.transcript || 'Working on it',
        status: 'running',
        startedAt: Date.now(),
        endedAt: null,
        actions: [],
      };
    }
    return this.currentTaskRecord;
  }

  /** Always builds fresh object/array references so React actually re-renders on every update. */
  private upsertTaskMessage(): void {
    const task = this.currentTaskRecord;
    if (!task) return;
    this.upsertMessage({
      id: task.id,
      role: 'system',
      content: task.goal,
      createdAt: task.startedAt,
      status: task.status === 'running' ? 'streaming' : 'final',
      task: { ...task, actions: task.actions.map((a) => ({ ...a })) },
    });
  }

  private startTaskAction(request: ActionRequest, inProgressText: string): string {
    const task = this.ensureCurrentTask();
    const action: ConversationTaskAction = {
      id: uuidv4(),
      type: request.type,
      request,
      startedAt: Date.now(),
      endedAt: null,
      inProgressText,
    };
    task.actions.push(action);
    this.activeActionIdByType.set(request.type, action.id);
    this.upsertTaskMessage();
    return action.id;
  }

  private updateTaskActionProgress(actionId: string, inProgressText: string): void {
    const action = this.currentTaskRecord?.actions.find((a) => a.id === actionId);
    if (!action) return;
    action.inProgressText = inProgressText;
    this.upsertTaskMessage();
  }

  private finishTaskAction(actionId: string, result: ActionResult, doneText: string): void {
    const task = this.currentTaskRecord;
    const action = task?.actions.find((a) => a.id === actionId);
    if (!task || !action) return;
    action.result = result;
    action.endedAt = Date.now();
    action.doneText = doneText;
    if (this.activeActionIdByType.get(action.type) === actionId) {
      this.activeActionIdByType.delete(action.type);
    }
    this.upsertTaskMessage();
  }

  /**
   * Called once a turn ends — the Task Card's final status/duration/report,
   * whichever way the turn concluded. `reason` decides status directly
   * instead of inferring it from action results: an interrupted or errored
   * turn must never be reported 'completed' just because no action
   * explicitly returned ok:false — most of the time nothing ever got the
   * chance to run or fail in the first place.
   */
  private finalizeTask(finalReport: string, reason: NonNullable<ConversationTurnRecord['endedReason']>): void {
    const task = this.currentTaskRecord;
    if (!task) return;
    task.endedAt = Date.now();
    task.status =
      reason === 'interrupted'
        ? 'interrupted'
        : reason === 'error'
          ? 'failed'
          : task.actions.some((a) => a.result?.ok === false)
            ? 'failed'
            : 'completed';
    task.finalReport = finalReport;
    this.upsertTaskMessage();
    this.currentTaskRecord = null;
    this.recordTaskProvenance(task);
  }

  /**
   * Fires once per finalized Task Card — walks its own already-tracked,
   * ordered action list (files read, files written, in order) so the
   * Memory Graph can link newly-created/modified files to the workspace,
   * this conversation, and whichever files were read earlier in the same
   * task. Never blocks the user-visible flow: fire-and-forget, since this
   * is internal memory bookkeeping, not something the user is waiting on.
   */
  private recordTaskProvenance(task: ConversationTaskRecord): void {
    const executeAction = this.args.executeAction;
    if (!executeAction) return;
    const actions = task.actions.filter((a): a is typeof a & { result: NonNullable<typeof a.result> } => Boolean(a.result));
    if (actions.length === 0) return;
    void executeAction({
      type: 'recordTaskProvenance',
      goal: task.goal,
      conversationId: this.activeSessionId ?? undefined,
      actions: actions.map((a) => ({ request: a.request, result: a.result })),
    }).catch(() => {
      // Best-effort memory bookkeeping — a failure here never surfaces to the user.
    });
  }

  /**
   * Re-runs one failed step from a (possibly already-finished) Task Card's
   * own recorded request — the "Retry failed step" action in Task Details.
   * A direct re-execution, not routed through the model: the user clicking
   * Retry is itself the confirmation, so the retried request always carries
   * confirmed:true, same as any other explicit user "yes."
   */
  async retryTaskAction(taskId: string, actionId: string): Promise<void> {
    const executeAction = this.args.executeAction;
    if (!executeAction) return;
    const message = this.snapshot.messages.find((m) => m.id === taskId && m.task);
    if (!message?.task) return;
    const action = message.task.actions.find((a) => a.id === actionId);
    if (!action || action.result?.ok) return;

    const task = { ...message.task, actions: message.task.actions.map((a) => ({ ...a })) };
    const retrying = task.actions.find((a) => a.id === actionId)!;
    retrying.result = undefined;
    retrying.endedAt = null;
    retrying.doneText = undefined;
    task.status = 'running';
    task.endedAt = null;
    this.upsertMessage({ ...message, status: 'streaming', task });

    const retryRequest = { ...action.request, confirmed: true } as ActionRequest;
    let result: ActionResult;
    try {
      result = await executeAction(retryRequest);
    } catch (error) {
      result = { ok: false, reason: 'failed', message: error instanceof Error ? error.message : 'Retry failed unexpectedly.' };
    }

    // Same real-capture-start requirement as the two other execution paths
    // (handleToolCall, executeConfirmedAction) — a retried
    // startCommunicationCapture from the Task Card's "Retry" button must
    // also actually start the mic/system-audio stream, not just recreate
    // the CommunicationRecord.
    await this.maybeStartRealCommunicationCapture(retryRequest, result);

    const finalActions = task.actions.map((a) =>
      a.id === actionId ? { ...a, result, endedAt: Date.now(), doneText: result.ok ? 'Done.' : ((result as { message?: string }).message ?? "Couldn't finish that.") } : a
    );
    const finalTask: ConversationTaskRecord = {
      ...task,
      actions: finalActions,
      status: finalActions.some((a) => a.result?.ok === false) ? 'failed' : 'completed',
      endedAt: Date.now(),
    };
    this.upsertMessage({ ...message, status: 'final', task: finalTask });
  }

  /**
   * Real mic/system-audio capture lives in THIS renderer process
   * (getUserMedia/MediaRecorder can't run in the main process) — the
   * plugin itself only manages the CommunicationRecord's metadata/status.
   * Shared by all three places a startCommunicationCapture request can
   * finish executing (handleToolCall's initial pass, executeConfirmedAction
   * since it's always confirmed, and retryTaskAction's Task Card retry) so
   * real capture reliably starts regardless of which path got there —
   * never optimistically before the plugin has genuinely created the
   * record, so a failure to create it never leaves a dangling live stream
   * with nowhere to save to.
   */
  private async maybeStartRealCommunicationCapture(request: ActionRequest, result: ActionResult): Promise<void> {
    if (request.type !== 'startCommunicationCapture' || !result.ok) return;
    const communicationId = (result.data as { communicationId?: string } | undefined)?.communicationId;
    if (!communicationId) return;
    try {
      const meetingLike = ['googleMeet', 'zoom', 'teams', 'webex', 'slackHuddle', 'discord'].includes(request.medium);
      const handle = await startCommunicationAudioCapture(communicationId, { includeSystemAudio: meetingLike });
      this.activeCommunicationCaptures.set(communicationId, handle);
    } catch (error) {
      this.log('communication-capture-start-failed', { communicationId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private startTurnRecord(transcript: string): void {
    if (this.currentTurnRecord) {
      // Shouldn't normally happen (interrupts finalize the previous record
      // first) — but never silently drop a turn's metadata if it does.
      this.finalizeCurrentTurn('interrupted', 'superseded by a new turn');
    }
    // Recovery Policy caps apply per user turn, not per continuation.
    this.toolIterationCount = 0;
    this.failureSignatureCounts = new Map();
    this.executionSupervisor.begin(transcript);
    this.currentTurnRecord = {
      id: uuidv4(),
      startedAt: Date.now(),
      endedAt: null,
      transcript,
      assistantResponse: '',
      actionsExecuted: [],
      errors: [],
      model: this.args.reasoningRuntime.getProvider().id,
      voice: this.args.speechSynthesis.name,
      endedReason: null,
    };
  }

  private finalizeCurrentTurn(reason: NonNullable<ConversationTurnRecord['endedReason']>, note?: string): void {
    if (!this.currentTurnRecord) return;
    this.currentTurnRecord.endedAt = Date.now();
    this.currentTurnRecord.endedReason = reason;
    this.turnRecords.push(this.currentTurnRecord);
    if (this.turnRecords.length > MAX_TURN_RECORDS) this.turnRecords.shift();
    this.log('turn-ended', {
      id: this.currentTurnRecord.id,
      reason,
      note,
      durationMs: this.currentTurnRecord.endedAt - this.currentTurnRecord.startedAt,
    });
    this.executionSupervisor.end(reason, this.currentTurnRecord.assistantResponse || note || '');
    this.finalizeTask(this.currentTurnRecord.assistantResponse || note || '', reason);
    this.persistTurn(this.currentTurnRecord);
    this.currentTurnRecord = null;
  }

  /** Hands a finished turn to Electron's session history, if wired. Skips turns with no real content (e.g. an immediately-superseded record). */
  private persistTurn(turn: ConversationTurnRecord): void {
    const persist = this.args.persistTurn;
    if (!persist || (!turn.transcript.trim() && !turn.assistantResponse.trim())) return;
    void this.persistTurnAsync(turn, persist);
  }

  private async persistTurnAsync(
    turn: ConversationTurnRecord,
    persist: (turn: ConversationTurnRecord, hint: SessionContinuationHint) => Promise<{ id: string } | void>
  ): Promise<void> {
    try {
      let hint: SessionContinuationHint;
      if (this.activeSessionId) {
        // Already know which session this conversation is in — every turn
        // after the first stays there, no re-classification needed.
        hint = { type: 'continue', sessionId: this.activeSessionId };
      } else if (this.args.resolveSession) {
        hint = await this.args.resolveSession(turn.transcript);
      } else {
        hint = { type: 'auto' };
      }

      const session = await persist(
        { ...turn, actionsExecuted: [...turn.actionsExecuted], errors: [...turn.errors] },
        hint
      );
      if (session) this.activeSessionId = session.id;
    } catch (error) {
      console.error('[ConversationRuntime] failed to persist turn to session history', error);
    }
  }

  /** Structured runtime event — dev-console only, capped in-memory ring buffer. Never rendered in any UI. */
  private log(event: string, data?: Record<string, unknown>): void {
    this.debugLog.push({ timestamp: Date.now(), event, data });
    if (this.debugLog.length > MAX_LOG_ENTRIES) this.debugLog.shift();
    console.debug('[ConversationRuntime]', event, data ?? '');
    voiceDebugBus.emit({ type: 'runtime', event, data }); // [DEBUG-TEMP]
  }

  private updateSnapshot(patch: Partial<ConversationSnapshot>) {
    const prevState = this.snapshot.state;
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };
    if (patch.state !== undefined && patch.state !== prevState) {
      this.log('transition', { from: prevState, to: patch.state });
    }
    this.listeners.forEach((listener) => listener(this.snapshot));
    this.args.onStateChange?.(this.snapshot.state);
  }
}
