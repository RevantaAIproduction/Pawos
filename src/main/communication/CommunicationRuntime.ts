import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  AdapterResult,
  CommunicationRecord,
  CommunicationRuntimeEvent,
  CommunicationSummary,
  CompanyWorkspace,
  FollowUp,
  PairedDeviceRecord,
  RecordingMode,
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

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    communicationSessionStore.init();
    communicationMemoryStore.init();
    communicationIntelligenceStore.init();
    communicationSearchIndexStore.init();
    mobilePairingStore.init();
    emailPreferencesStore.init();

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
    };
    communicationSessionStore.create(record);
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

  /** Called by the renderer's real audio-capture pipeline once it has bytes to persist — never buffered only in memory (architecture doc §18 evidence-preservation principle). */
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

  pauseCapture(communicationId: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
    return { ok: true };
  }

  resumeCapture(communicationId: string): AdapterResult {
    const record = communicationSessionStore.get(communicationId);
    if (!record) return { ok: false, message: 'Communication not found.' };
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
