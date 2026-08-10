import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  AdapterResult,
  CommunicationRecord,
  CommunicationRuntimeEvent,
  CommunicationSummary,
  CompanyWorkspace,
  FollowUp,
  PairedDeviceRecord,
  RecordingMediaKind,
  RecordingMode,
  RecordingTimelineEntry,
  SearchQuery,
  SearchResult,
  TimelineScope,
  UnifiedTimelineEntry,
} from '../../shared/communication/CommunicationTypes';
import { communicationSourceRegistry } from './CommunicationSourceRegistry';
import { communicationConnectorRegistry } from './CommunicationConnectorRegistry';
import { communicationSessionStore } from './CommunicationSessionStore';
import { communicationMemoryStore } from './CommunicationMemoryStore';
import { communicationIntelligenceStore } from './CommunicationIntelligenceStore';
import { communicationTimelineStore } from './CommunicationTimelineStore';
import { communicationPipeline } from './CommunicationPipeline';
import { searchCommunications } from './CommunicationSearch';
import { communicationSearchIndexStore } from './CommunicationSearchIndexStore';
import { zoomAdapter, teamsAdapter, webexAdapter, googleMeetAdapter } from './adapters/DesktopMeetingProviderAdapter';
import {
  zoomParticipantAdapter,
  googleMeetParticipantAdapter,
  teamsParticipantAdapter,
  webexParticipantAdapter,
} from './adapters/MeetingParticipantAdapters';
import { mobileCompanionPhoneCallAdapter } from './adapters/MobileCompanionPhoneCallAdapter';
import { mobilePairingStore } from './MobilePairingStore';
import { emailPreferencesStore } from './EmailPreferencesStore';
import { startVisualContextTracking, type VisualContextHandle } from './VisualContextTracker';
import {
  isEncryptionAvailable,
  generateSessionKey,
  wrapSessionKey,
  unwrapSessionKey,
  encryptFrame,
  completeFrameBoundary,
} from './CommunicationEncryption';
import { platformEventBus } from '../platform/events/PlatformEventBus';
import { generateEvidenceForRecording, getEvidenceForRecording } from './CommunicationEvidencePipeline';
import { generateBusinessInsightsForRecording, getBusinessInsightsForRecording } from './CommunicationBusinessIntelligencePipeline';
import type { EvidenceObject, BusinessInsight } from '../../shared/communication/CommunicationTypes';

/** Internal-only diagnostic bundle for one recording — never surfaced in any end-user UI (Phase 1's own "Administrator Visibility" requirement: users must never see internal storage/upload/crash-recovery/integrity state). Consumed only by tests and any future admin-only surface. */
export type RecordingDiagnostics = {
  communicationId: string;
  uploadStatus: string;
  encryptionState: string;
  audioChecksum: string | null;
  videoChecksum: string | null;
  hasPartialAudio: boolean;
  hasPartialVideo: boolean;
  recordingFinalizedAt: number | null;
};

/**
 * The public facade — the one object the rest of Paw (Conversation
 * Runtime, Task Card, IntentRegistry) ever calls into (architecture doc
 * §16), mirroring BrowserRuntime's role as the single entry point over
 * adapters + capture. Nothing outside this file (and the plugins that
 * call it) ever touches CommunicationSessionStore/MemoryStore/
 * IntelligenceStore/Pipeline directly.
 */
class CommunicationRuntime extends EventEmitter {
  private initialized = false;
  /** Real visual-context sampling handles, keyed by communicationId — only ever running for meeting-medium recordings, started right after startCapture and stopped right before stopCapture finalizes. */
  private visualContextHandles = new Map<string, VisualContextHandle>();
  /** Unwrapped per-session AES-256-GCM keys, held only in this process's memory for the lifetime of an active recording — the wrapped (safeStorage-encrypted) copy on the record is the only form ever persisted to disk. */
  private sessionKeys = new Map<string, Buffer>();
  /** Per-session cumulative paused duration (Timeline Indexing, Phase 2) — tracked only in this process's memory, since pause/resume are always main-process-mediated requests (pauseCapture/resumeCapture below). Used to compute content-relative timeline timestamps that exclude paused wall-clock time; deliberately not persisted, since it's re-derivable from nothing after a crash — a just-recovered session's own recovery timestamp is honestly approximate for exactly this reason (see recoverInterruptedRecordings' own comment). */
  private pauseTracking = new Map<string, { totalPausedMs: number; pausedAt: number | null }>();

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    communicationSessionStore.init();
    communicationMemoryStore.init();
    communicationIntelligenceStore.init();
    communicationSearchIndexStore.init();
    mobilePairingStore.init();
    emailPreferencesStore.init();

    // Crash recovery (Recording & Storage Foundation): any session still
    // marked 'recording' at this point was left that way by a previous
    // process crash/force-quit, since nothing can genuinely be mid-recording
    // in the instant this file is first initialized. Finalizes whatever was
    // actually captured — never discards it — before anything else runs.
    this.recoverInterruptedRecordings();

    communicationConnectorRegistry.register('meetingProvider', zoomAdapter);
    communicationConnectorRegistry.register('meetingProvider', teamsAdapter);
    communicationConnectorRegistry.register('meetingProvider', webexAdapter);
    communicationConnectorRegistry.register('meetingProvider', googleMeetAdapter);

    // Meeting Participant (bot-join) adapters — registered but not invoked
    // by startCapture() today. Desktop capture is the primary architecture;
    // these stay available as an optional future enhancement for whenever
    // real platform SDK credentials are configured, without requiring any
    // runtime redesign to turn on.
    communicationConnectorRegistry.register('meetingParticipant', zoomParticipantAdapter);
    communicationConnectorRegistry.register('meetingParticipant', googleMeetParticipantAdapter);
    communicationConnectorRegistry.register('meetingParticipant', teamsParticipantAdapter);
    communicationConnectorRegistry.register('meetingParticipant', webexParticipantAdapter);

    communicationConnectorRegistry.register('phoneCall', mobileCompanionPhoneCallAdapter);

    communicationPipeline.on('event', (event: CommunicationRuntimeEvent) => this.emit('event', event));

    // Proactive Meeting Detection (desktop-first architecture): each
    // provider adapter already polls for its own app/tab in the background
    // (every 4s, started once .subscribe() is called below) and emits a
    // real 'started'/'ended' transition — never a guess, never polled by
    // this file directly. On a genuine new meeting starting, tell the
    // renderer so it can ask the user whether to record it; recording
    // itself never begins from this alone. A meeting ending while Paw was
    // mid-recording finalizes that recording automatically — the same
    // "infer, don't interrogate" spirit as the rest of this app, without
    // requiring the user to remember to say "stop."
    for (const adapter of [zoomAdapter, teamsAdapter, webexAdapter, googleMeetAdapter]) {
      adapter.subscribe((event) => {
        if (event.type === 'ended') {
          const match = communicationSessionStore.list().find((r) => r.status === 'recording' && r.sourceMeetingId === event.meetingId);
          if (match) void this.stopCapture(match.id);
          return;
        }
        if (event.type === 'started') {
          const alreadyRecordingThisMedium = communicationSessionStore.list().some((r) => r.status === 'recording' && r.medium === adapter.id);
          if (alreadyRecordingThisMedium) return;
          this.emitEvent({ type: 'meetingDetected', medium: adapter.id, title: event.title, meetingId: event.meetingId });
        }
      });
    }
  }

  subscribe(onEvent: (event: CommunicationRuntimeEvent) => void): () => void {
    this.on('event', onEvent);
    return () => this.off('event', onEvent);
  }

  private emitEvent(event: CommunicationRuntimeEvent): void {
    this.emit('event', event);
  }

  // -- Capture --------------------------------------------------------

  /** Meeting and phone-call sources must have explicit, recorded consent before recording ever begins — face-to-face/voice notes don't (the user is recording their own conversation by their own "start recording" command). Used by StartCommunicationCapturePlugin's requirements() to ask the consent question via the existing "Collect Missing Information" pipeline before this method is ever called. */
  requiresConsent(medium: string): boolean {
    const descriptor = communicationSourceRegistry.get(medium);
    return descriptor?.requiresAdapter === 'meetingProvider' || descriptor?.requiresAdapter === 'phoneCall';
  }

  async startCapture(input: { medium: string; title?: string; consentConfirmed?: boolean }): Promise<AdapterResult<{ communicationId: string }>> {
    const descriptor = communicationSourceRegistry.get(input.medium);
    if (!descriptor) return { ok: false, message: `Unknown communication source "${input.medium}".` };

    const now = Date.now();
    const id = uuidv4();
    const consentRequired = this.requiresConsent(input.medium);

    let sourceMeetingId: string | null = null;
    let providerId: string | null = null;
    let recordingMode: RecordingMode = 'direct';

    if (descriptor.requiresAdapter === 'meetingProvider') {
      // Desktop capture is the primary, only-real-today architecture
      // (Communication Intelligence Runtime desktop-first redesign): Paw
      // never attempts to join a meeting as a bot participant here. Meeting
      // adapters (DesktopMeetingProviderAdapter) are metadata-only — they
      // detect the real running meeting window/process and report its
      // title/id, nothing more. Recording itself always goes through the
      // one generic desktop audio-capture pipeline
      // (CommunicationAudioCapture.ts), regardless of which platform is
      // running. This makes the runtime fully functional with zero
      // provider SDKs or credentials installed. Real participant-join
      // support (MeetingParticipantAdapters.ts) stays registered as an
      // optional future enhancement, but is not invoked by default.
      recordingMode = 'desktopCapture';
      const active = await communicationConnectorRegistry.listActiveMeetingProviders();
      const match = active.find((a) => a.id === input.medium) ?? active[0];
      if (match) {
        const meeting = await match.getActiveMeeting();
        sourceMeetingId = meeting?.meetingId ?? null;
        providerId = match.id;
      }
    }

    const record: CommunicationRecord = {
      id,
      medium: input.medium,
      title: input.title || descriptor.displayName,
      startedAt: now,
      endedAt: null,
      status: 'recording',
      pipelineStage: 'transcribing',
      capturedVia: descriptor.capturedVia,
      deviceId: null,
      participants: [],
      companies: [],
      projects: [],
      tags: [],
      audioPath: null,
      transcriptPath: null,
      bodyPath: null,
      summaryPath: null,
      attachmentPaths: [],
      sourceMeetingId,
      sourceThreadId: null,
      createdAt: now,
      updatedAt: now,
      meetingMetadata: descriptor.requiresAdapter === 'meetingProvider' ? { providerId, participants: [], cameraStatus: 'unknown', microphoneStatus: 'unknown', screenSharing: 'unknown', recordingStatus: 'recording' } : undefined,
      recordingMode,
      consentConfirmed: consentRequired ? Boolean(input.consentConfirmed) : true,
      consentConfirmedAt: consentRequired && input.consentConfirmed ? now : null,
      videoPath: null,
      speakerTimeline: [],
      visualEvidence: [],
      uploadStatus: 'pending',
      encryptionState: 'none',
      encryptedSessionKey: null,
      durationSeconds: null,
      audioSizeBytes: null,
      videoSizeBytes: null,
      audioChecksum: null,
      videoChecksum: null,
      recordingFinalizedAt: null,
    };
    communicationSessionStore.create(record);
    communicationSessionStore.appendTimelineEntry(id, { atSeconds: 0, kind: 'recordingStarted', mediaKind: null });
    this.emitEvent({ type: 'captureStarted', communicationId: id });
    this.emitEvent({ type: 'captureStatusChanged', communicationId: id, status: 'recording' });
    this.emitEvent({ type: 'recordingModeChanged', communicationId: id, mode: recordingMode });

    // Real visual-context tracking — meeting mediums only, since it reads
    // what THIS device's own foreground window shows (not applicable to a
    // phone call or a voice note, where there's no "screen" to speak of).
    if (descriptor.requiresAdapter === 'meetingProvider') {
      const handle = startVisualContextTracking({
        recordingStartedAt: now,
        onChange: (event) => {
          const current = communicationSessionStore.get(id);
          if (!current) return;
          communicationSessionStore.update(id, { visualEvidence: [...current.visualEvidence, event] });
          this.emitEvent({ type: 'screenShareChanged', communicationId: id, event });
        },
      });
      this.visualContextHandles.set(id, handle);
    }

    return { ok: true, data: { communicationId: id } };
  }

  /**
   * Called once, at the very end of a legacy (Meeting Intelligence Runtime, pre-Phase-1) capture
   * flow that still ships one whole file on stop(). Kept working, unmodified in behavior, purely so
   * any caller not yet migrated to the new chunked appendRecordingChunk()/finalizeRecording() pair
   * below keeps functioning exactly as before — real Phase 1 capture (CommunicationAudioCapture.ts)
   * no longer calls this.
   */
  saveAudioChunk(communicationId: string, base64Data: string, mimeType: string): AdapterResult<{ audioPath: string }> {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('webm') ? 'webm' : 'webm';
    const fileName = record.audioPath ? undefined : `audio.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');
    const audioPath = fileName ? communicationSessionStore.writeBinaryFile(communicationId, fileName, buffer) : record.audioPath!;
    if (fileName) communicationSessionStore.update(communicationId, { audioPath });
    return { ok: true, data: { audioPath } };
  }

  // -- Recording & Storage Foundation (Phase 1) ---------------------------

  /** Returns the real (unwrapped) per-session encryption key, generating and wrapping a new one on first use of a session — or null when safeStorage's OS keychain genuinely isn't available, in which case the recording is honestly stored unencrypted rather than silently claiming a protection it doesn't have. */
  private getOrCreateSessionKey(record: CommunicationRecord): Buffer | null {
    const cached = this.sessionKeys.get(record.id);
    if (cached) return cached;
    if (record.encryptionState === 'encrypted' && record.encryptedSessionKey) {
      const unwrapped = unwrapSessionKey(record.encryptedSessionKey);
      if (unwrapped) this.sessionKeys.set(record.id, unwrapped);
      return unwrapped;
    }
    if (!isEncryptionAvailable()) {
      // Platform Runtime integration (one-way emission only — see PlatformEventBus.ts):
      // a degraded-security signal for Platform Administrators, never surfaced to the
      // recording user/customer. Fires at most once per session, since this branch is
      // only reached on a session's first chunk (the `cached`/wrapped-key checks above
      // return early on every subsequent call).
      platformEventBus.reportRuntimeEvent({
        runtime: 'communication',
        severity: 'warning',
        kind: 'health',
        status: 'degraded',
        detail: 'Recording session key could not be wrapped: safeStorage encryption is unavailable on this device. The recording will be stored unencrypted.',
      });
      return null;
    }
    const key = generateSessionKey();
    const wrapped = wrapSessionKey(key);
    if (!wrapped) return null;
    this.sessionKeys.set(record.id, key);
    communicationSessionStore.update(record.id, { encryptionState: 'encrypted', encryptedSessionKey: wrapped });
    return key;
  }

  /**
   * Timeline Indexing (Phase 2): the content-relative position (seconds since this session's own
   * startedAt, with cumulative paused wall-clock time subtracted) at the current instant — the
   * single clock every timeline entry this runtime writes is computed from. Deliberately
   * content-relative, not wall-clock-with-pauses: a pause boundary must never shift the position of
   * everything recorded after it relative to the actual audio/video content, since the whole point
   * of a timeline is to let a future player seek to "this many seconds into the recording."
   * Clamped to never go negative (defensive against clock skew in tests/mocked environments).
   */
  private computeContentRelativeAtSeconds(record: CommunicationRecord): number {
    const tracking = this.pauseTracking.get(record.id);
    const totalPausedMs = tracking?.totalPausedMs ?? 0;
    const seconds = (Date.now() - record.startedAt - totalPausedMs) / 1000;
    return Math.max(0, seconds);
  }

  /**
   * Appends one real chunk of recorded media to durable storage the moment it arrives — streaming,
   * never buffering the recording as a whole. `expectedChecksum` (a SHA-256 the renderer computed
   * over this exact chunk before sending it) is re-verified against the actually-decoded bytes here;
   * a mismatch is reported as a failure rather than silently accepted, so the renderer's upload
   * queue can retry that one chunk instead of writing corrupted data.
   */
  appendRecordingChunk(communicationId: string, kind: RecordingMediaKind, base64Chunk: string, expectedChecksum?: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    // A stray/late chunk arriving after THIS kind was already finalized (e.g. a network-lagged
    // upload retry racing past finalizeRecording) must never reopen a completed file — checked
    // per-kind via audioPath/videoPath (not the shared uploadStatus field, which both kinds write
    // to and would otherwise cause a late audio chunk to falsely reject an in-flight video chunk,
    // or vice versa) so "Completed" is genuinely terminal for that kind specifically.
    const alreadyFinalized = kind === 'audio' ? record.audioPath !== null : record.videoPath !== null;
    if (alreadyFinalized) {
      return { ok: false, message: 'This recording has already been finalized — the chunk was rejected rather than reopening a completed file.' };
    }
    const buffer = Buffer.from(base64Chunk, 'base64');
    if (expectedChecksum) {
      const actual = crypto.createHash('sha256').update(buffer).digest('hex');
      if (actual !== expectedChecksum) {
        platformEventBus.reportRuntimeEvent({
          runtime: 'communication',
          severity: 'warning',
          kind: 'warning',
          message: 'Recording chunk checksum mismatch — chunk rejected, nothing written.',
          context: { communicationId, kind },
        });
        return { ok: false, message: 'Chunk integrity check failed — please retry this chunk.' };
      }
    }
    const key = this.getOrCreateSessionKey(record);
    const frame = key ? encryptFrame(buffer, key) : buffer;
    communicationSessionStore.appendRecordingChunk(communicationId, kind, frame);
    if (record.uploadStatus !== 'inProgress') {
      communicationSessionStore.update(communicationId, { uploadStatus: 'inProgress' });
    }
    // Timeline Indexing (Phase 2): one structural entry per real, accepted chunk — never for a
    // rejected one (both guards above already returned before this point). Content-relative
    // atSeconds computed at IPC-arrival time: a deliberate, disclosed approximation (not
    // frame-accurate audio-content timing) appropriate for a recording-lifecycle index, matching
    // this codebase's existing "segment-level, not word-level" honesty discipline for transcript
    // timestamps.
    communicationSessionStore.appendTimelineEntry(communicationId, {
      atSeconds: this.computeContentRelativeAtSeconds(record),
      kind: 'chunkRecorded',
      mediaKind: kind,
    });
    return { ok: true };
  }

  /** Atomically finalizes a recording's media file and computes its real, on-disk checksum/size — the single point at which a recording transitions from "still being written" to "complete." Safe to call with no data appended yet (e.g. a video-less audio-only session calling finalize for 'video'); returns ok:true with no-op data in that case, never an error, since "no video was ever captured" is an expected, honest outcome for most sessions. */
  async finalizeRecording(communicationId: string, kind: RecordingMediaKind, mimeType: string): Promise<AdapterResult<{ path: string; sizeBytes: number; checksum: string } | null>> {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const finalName = `${kind}.${ext}`;
    const finalized = communicationSessionStore.finalizeRecordingFile(communicationId, kind, finalName);
    if (!finalized) return { ok: true, data: null };
    const checksum = await communicationSessionStore.computeChecksum(finalized.fullPath);
    const patch: Partial<CommunicationRecord> =
      kind === 'audio'
        ? { audioPath: finalized.fullPath, audioSizeBytes: finalized.sizeBytes, audioChecksum: checksum }
        : { videoPath: finalized.fullPath, videoSizeBytes: finalized.sizeBytes, videoChecksum: checksum };
    communicationSessionStore.update(communicationId, { ...patch, uploadStatus: 'completed', recordingFinalizedAt: Date.now() });
    this.sessionKeys.delete(communicationId); // the wrapped copy on the record is sufficient for any later read; no need to keep the raw key resident once recording is done
    communicationSessionStore.appendTimelineEntry(communicationId, {
      atSeconds: this.computeContentRelativeAtSeconds(record),
      kind: 'recordingFinalized',
      mediaKind: kind,
    });
    return { ok: true, data: { path: finalized.fullPath, sizeBytes: finalized.sizeBytes, checksum } };
  }

  /**
   * Crash recovery entry point for the recording layer itself (distinct from
   * CommunicationPipeline.resumeInterrupted(), which recovers post-recording processing stages).
   * Called once at startup. Every session still 'recording' was interrupted by a previous
   * crash/force-quit — whatever media was actually captured is finalized as-is (never discarded),
   * a half-written trailing chunk (app killed mid-append) is safely truncated to its last complete
   * frame rather than left corrupt, and the session is honestly marked 'interrupted'.
   */
  async recoverInterruptedRecordings(): Promise<{ recoveredIds: string[] }> {
    const stale = communicationSessionStore.listStaleRecordingSessions();
    const recoveredIds: string[] = [];
    for (const record of stale) {
      // Timeline Indexing (Phase 2): repair once per session, before anything else — a half-written
      // trailing line (from the same crash that interrupted the recording itself) is truncated to
      // its last valid entry, mirroring the exact "truncate to last complete frame" discipline
      // already proven for the encrypted binary chunk storage above. Idempotent: a no-op on an
      // already-valid file, so a second recovery run (already established as a no-op for stale-
      // session detection) never re-touches this file either.
      communicationSessionStore.repairTimelineIndex(record.id);
      for (const kind of ['audio', 'video'] as const) {
        if (!communicationSessionStore.hasPartialRecording(record.id, kind)) continue;
        // Only truncate to a clean frame boundary when this session was encrypted — an
        // unencrypted partial file has no framing to validate, so it's kept exactly as-is.
        if (record.encryptionState === 'encrypted') {
          const raw = communicationSessionStore.readPartialRecording(record.id, kind);
          if (raw) communicationSessionStore.truncatePartialRecordingToBoundary(record.id, kind, completeFrameBoundary(raw));
        }
        await this.finalizeRecording(record.id, kind, kind === 'video' ? 'video/webm' : 'audio/webm');
        this.emitEvent({ type: 'recordingRecovered', communicationId: record.id, kind });
        // Timeline Indexing (Phase 2): an honestly-approximate marker — this process's own
        // pauseTracking map is always empty for a just-recovered session (it's per-process, in-
        // memory state that a crash necessarily wipes), so this entry's atSeconds cannot exclude
        // any paused duration the session may genuinely have had before crashing. Disclosed, not
        // silently assumed precise: a recovery marker's job is "the app crashed and picked this
        // back up," not a frame-accurate content position.
        communicationSessionStore.appendTimelineEntry(record.id, {
          atSeconds: this.computeContentRelativeAtSeconds(record),
          kind: 'recordingRecovered',
          mediaKind: kind,
        });
        // Platform Runtime integration (one-way emission only): a genuine crash-recovery
        // outcome, exactly the kind of health signal Platform Administrators need visibility
        // into. This never gates or blocks the recovery itself — the recovery has already
        // completed by the time this fires.
        platformEventBus.reportRuntimeEvent({
          runtime: 'communication',
          severity: 'info',
          kind: 'recovery',
          action: 'recoverInterruptedRecording',
          outcome: 'succeeded',
          attempt: 1,
        });
      }
      communicationSessionStore.update(record.id, { status: 'interrupted', endedAt: record.endedAt ?? Date.now() });
      recoveredIds.push(record.id);
    }
    return { recoveredIds };
  }

  /** Internal-only — never rendered in any end-user UI (Administrator Visibility requirement). */
  getRecordingDiagnostics(communicationId: string): RecordingDiagnostics | null {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return null;
    return {
      communicationId,
      uploadStatus: record.uploadStatus,
      encryptionState: record.encryptionState,
      audioChecksum: record.audioChecksum,
      videoChecksum: record.videoChecksum,
      hasPartialAudio: communicationSessionStore.hasPartialRecording(communicationId, 'audio'),
      hasPartialVideo: communicationSessionStore.hasPartialRecording(communicationId, 'video'),
      recordingFinalizedAt: record.recordingFinalizedAt,
    };
  }

  /** Real deletion — removes the index entry AND every on-disk file for this session. Distinct from the legacy no-op-adjacent CommunicationSessionStore.delete(), which only ever touched the index. */
  deleteRecording(communicationId: string): AdapterResult {
    const deleted = communicationSessionStore.deleteSessionCompletely(communicationId);
    this.sessionKeys.delete(communicationId);
    this.pauseTracking.delete(communicationId);
    return deleted ? { ok: true } : { ok: false, message: 'Communication not found.' };
  }

  /**
   * Timeline Indexing (Phase 2) read surface — the structural recording-lifecycle timeline for one
   * session, sorted by atSeconds (stable sort, so entries with equal timestamps keep their original
   * write order). Sorting at read time — rather than trusting write order alone — makes ordering a
   * real guarantee for every consumer regardless of a rare race between an in-flight chunk and a
   * concurrently-requested pause (see the Phase 2 freeze report's own analysis of this edge case).
   * Not yet consumed by any UI — ships the interface now, matching the "ship the interface before
   * the consumer" pattern already established repeatedly elsewhere in this codebase (e.g. Coding
   * Runtime V2's TypeScriptLanguageProvider route/syntax methods, Phase 5's
   * RepositorySemanticIndexService query methods).
   */
  getRecordingTimeline(communicationId: string): RecordingTimelineEntry[] {
    return [...communicationSessionStore.readTimelineEntries(communicationId)].sort((a, b) => a.atSeconds - b.atSeconds);
  }

  /**
   * Foundation Intelligence (Phase 3A) — generates immutable Evidence Objects for one finalized
   * recording. Deliberately a standalone, explicitly-invoked method: nothing in this class's own
   * recording-lifecycle methods (startCapture/appendRecordingChunk/finalizeRecording/pauseCapture/
   * resumeCapture/recoverInterruptedRecordings) ever calls this — "recording must never wait for AI,
   * timeline generation must never wait for AI" holds structurally, not just by convention. Reuses
   * the existing, unmodified transcription call; see CommunicationEvidencePipeline.ts for the full
   * idempotency/crash-safety/confidence-model design.
   */
  async generateEvidence(communicationId: string, apiKey: string, options?: { model?: string; baseUrl?: string }): Promise<AdapterResult<{ evidenceCount: number }>> {
    return generateEvidenceForRecording({ communicationId, apiKey, model: options?.model, baseUrl: options?.baseUrl });
  }

  /** Read-only accessor for a recording's Evidence Objects, sorted by startTimestamp. Not yet consumed by any UI — ships the interface now, per this codebase's established "ship the interface before the consumer" pattern. */
  getEvidence(communicationId: string): EvidenceObject[] {
    return getEvidenceForRecording(communicationId);
  }

  /**
   * Business Intelligence (Phase 3B) — interprets one recording's already-finalized Evidence
   * Objects into decisions/requirements/risks/buying signals/objections/opportunities/sentiment/
   * coaching. Never called from any recording/timeline/evidence lifecycle method — the same
   * structural isolation already proven for generateEvidence() above. Requires Phase 3A evidence
   * to already exist; see CommunicationBusinessIntelligencePipeline.ts for the full idempotency/
   * crash-safety/evidenceId-validation design.
   */
  async generateBusinessInsights(communicationId: string, apiKey: string, options?: { model?: string; baseUrl?: string }): Promise<AdapterResult<{ insightCount: number }>> {
    return generateBusinessInsightsForRecording({ communicationId, apiKey, model: options?.model, baseUrl: options?.baseUrl });
  }

  /** Read-only accessor for a recording's Business Insights, sorted by the earliest startTimestamp among each insight's own cited evidence. Not yet consumed by any UI — ships the interface now. */
  getBusinessInsights(communicationId: string): BusinessInsight[] {
    return getBusinessInsightsForRecording(communicationId);
  }

  /**
   * Pause/resume of the *live* capture itself (distinct from upload pause/resume, which is a
   * renderer-side queue concern) — the main process has no direct handle to the renderer's
   * MediaRecorder, so this relays the request as a real event over the same
   * subscribe()/onCommunicationEvent() channel already used for every other cross-process
   * Communication Runtime signal; the renderer's capture handle (CommunicationAudioCapture.ts) is
   * the side that actually calls MediaRecorder.pause()/resume(). CommunicationStatus itself is
   * deliberately left unchanged ('recording' the whole time a pause is in effect) — pausing is a
   * live-capture concept, not a session-lifecycle one.
   */
  pauseCapture(communicationId: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    if (record.status !== 'recording') return { ok: false, message: 'This recording is not currently active.' };
    // Re-entrancy guard (Timeline Indexing production verification): every other timeline-writing
    // method already guards against being invoked twice for the same real event (appendRecordingChunk
    // rejects a chunk for an already-finalized kind; finalizeRecording is a no-op past the first
    // successful call; recoverInterruptedRecordings only ever processes a still-'recording' session
    // once). pauseCapture/resumeCapture were the one pair missing an analogous guard — a caller
    // invoking pauseCapture() twice in a row (e.g. a double-click) would otherwise append two
    // 'recordingPaused' entries for the same real pause action. Guarded here the same way: a no-op
    // rejection, never a duplicate write.
    const tracking = this.pauseTracking.get(communicationId) ?? { totalPausedMs: 0, pausedAt: null };
    if (tracking.pausedAt !== null) return { ok: false, message: 'This recording is already paused.' };
    // Record the pause marker BEFORE starting the pause-duration clock (tracking.pausedAt is set
    // immediately after), so this entry's atSeconds reflects the exact instant content recording
    // stopped, not a moment after paused time has already begun accruing.
    communicationSessionStore.appendTimelineEntry(communicationId, {
      atSeconds: this.computeContentRelativeAtSeconds(record),
      kind: 'recordingPaused',
      mediaKind: null,
    });
    tracking.pausedAt = Date.now();
    this.pauseTracking.set(communicationId, tracking);
    this.emitEvent({ type: 'recordingPauseRequested', communicationId });
    return { ok: true };
  }

  resumeCapture(communicationId: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    if (record.status !== 'recording') return { ok: false, message: 'This recording is not currently active.' };
    // Same re-entrancy guard as pauseCapture, mirrored: resuming when not currently paused (e.g. a
    // double-click, or a resume with no matching prior pause) is rejected, never appended as a
    // duplicate/spurious 'recordingResumed' entry.
    const tracking = this.pauseTracking.get(communicationId);
    if (!tracking?.pausedAt) return { ok: false, message: 'This recording is not currently paused.' };
    // Close out the paused-duration window first, so the timeline entry below is computed with the
    // pause fully accounted for — content-relative time at resume must equal content-relative time
    // at pause (no content was produced in between), which this ordering guarantees exactly.
    tracking.totalPausedMs += Date.now() - tracking.pausedAt;
    tracking.pausedAt = null;
    communicationSessionStore.appendTimelineEntry(communicationId, {
      atSeconds: this.computeContentRelativeAtSeconds(record),
      kind: 'recordingResumed',
      mediaKind: null,
    });
    this.emitEvent({ type: 'recordingResumeRequested', communicationId });
    return { ok: true };
  }

  async stopCapture(communicationId: string): Promise<AdapterResult> {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    const visualHandle = this.visualContextHandles.get(communicationId);
    if (visualHandle) {
      visualHandle.stop();
      this.visualContextHandles.delete(communicationId);
    }
    if (record.status !== 'recording') return { ok: true }; // already finalized — idempotent
    communicationSessionStore.update(communicationId, { endedAt: Date.now(), status: 'processing' });
    this.emitEvent({ type: 'captureStatusChanged', communicationId, status: 'processing' });
    return { ok: true };
  }

  async processCommunication(communicationId: string, apiKey: string): Promise<AdapterResult<{ pipelineStage: string }>> {
    const result = await communicationPipeline.run(communicationId, apiKey);
    if (!result.ok) return { ok: false, message: result.error ?? 'Processing failed.' };
    const record = communicationSessionStore.get(communicationId);
    return { ok: true, data: { pipelineStage: record?.pipelineStage ?? 'done' } };
  }

  addNote(communicationId: string, note: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    const existing = communicationSessionStore.readTextFile(communicationSessionStore.folderFor(communicationId) + '/notes.txt') ?? '';
    communicationSessionStore.writeTextFile(communicationId, 'notes.txt', existing ? `${existing}\n\n${note}` : note);
    return { ok: true };
  }

  // -- Recovery ---------------------------------------------------------

  async resumeInterrupted(apiKey: string | undefined): Promise<{ resumedCommunicationIds: string[] }> {
    const resumedCommunicationIds = await communicationPipeline.resumeInterrupted(apiKey);
    return { resumedCommunicationIds };
  }

  // -- Query / read -------------------------------------------------------

  getCommunication(communicationId: string): CommunicationRecord | null {
    return communicationSessionStore.get(communicationId) ?? null;
  }

  getTimeline(scope?: TimelineScope): UnifiedTimelineEntry[] {
    return communicationTimelineStore.getTimeline(scope);
  }

  getCompanyWorkspace(companyId: string): CompanyWorkspace | null {
    return communicationTimelineStore.getCompanyWorkspace(companyId);
  }

  // -- Phase 1 org-share bridge: read-only local lookups so a member can
  // pick which local contact/company/summary/follow-up to share into an
  // organization. Never writes back, never touches Supabase itself — the
  // renderer's OrgSyncBridge does the actual write via CrmService.

  listLocalParticipants() {
    return communicationMemoryStore.listParticipants();
  }

  listLocalCompanies() {
    return communicationMemoryStore.listCompanies();
  }

  listLocalSummaries(): CommunicationSummary[] {
    return communicationSessionStore
      .list()
      .map((record) => communicationIntelligenceStore.getSummary(record.id))
      .filter((summary): summary is CommunicationSummary => Boolean(summary));
  }

  listLocalFollowUps(): FollowUp[] {
    return communicationIntelligenceStore.listFollowUps();
  }

  async search(query: SearchQuery, apiKey?: string): Promise<SearchResult[]> {
    return searchCommunications(query, apiKey);
  }

  getRelationships(nodeId: string, kind: Parameters<typeof communicationMemoryStore.getRelationships>[1]) {
    return communicationMemoryStore.getRelationships(nodeId, kind);
  }

  // -- Mobile -------------------------------------------------------------

  beginPairing(): AdapterResult<{ pairingToken: string }> {
    return { ok: true, data: { pairingToken: mobilePairingStore.beginPairing() } };
  }

  listPairedDevices(): PairedDeviceRecord[] {
    return mobilePairingStore.list();
  }

  unpairDevice(deviceId: string): AdapterResult {
    mobilePairingStore.revoke(deviceId);
    return { ok: true };
  }
}

export const communicationRuntime = new CommunicationRuntime();
