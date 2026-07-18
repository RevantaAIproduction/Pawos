import type { ActionItem, Decision, RecordingMode, SpeakerTimelineEntry, VisualEvidenceEvent } from '../../shared/communication/CommunicationTypes';

/**
 * Communication Workspace region contract (architecture doc §14) — direct
 * sibling of WorkspaceTypes.ts's WorkspaceRegionId: declarative regions,
 * filled reactively from real CommunicationRuntimeEvent data, an absent
 * region renders nothing rather than placeholder chrome. Kept in its own
 * file (not merged into WorkspaceTypes.ts) since that file documents it
 * must never import anything runtime-specific — this is a different
 * runtime's region set, not an extension of Coding Intelligence Runtime's.
 */
export type CommunicationWorkspaceRegionId = 'liveTranscript' | 'participants' | 'detectedTopics' | 'actionItems' | 'evidence' | 'speakerTimeline' | 'decisions' | 'visualContext';

export type CommunicationWorkspaceState = {
  communicationId: string;
  status: 'recording' | 'processing' | 'completed' | 'failed' | 'interrupted';
  /** Which mechanism is actually capturing this recording — null until the runtime resolves it (join attempt result, or 'direct' immediately for face-to-face/voice notes). Always shown honestly, never assumed. */
  recordingMode: RecordingMode | null;
  regions: {
    liveTranscript: { latestLines: string[] } | null;
    participants: { names: string[] } | null;
    detectedTopics: { topics: string[] } | null;
    actionItems: { items: ActionItem[] } | null;
    evidence: { durationSeconds: number; lastWriteAt: number | null } | null;
    /** Only populated once processing completes — real, derived from the transcript, never live (no SDK integration exists to stream speaker changes mid-call). */
    speakerTimeline: { entries: SpeakerTimelineEntry[] } | null;
    decisions: { items: Decision[] } | null;
    /** Real, own-device application-switch evidence sampled while a meeting-medium recording is active (desktop-first architecture) — populated live as screenShareChanged events arrive, meeting mediums only (null for face-to-face/voice notes/phone calls, which have no "screen" concept). */
    visualContext: { events: VisualEvidenceEvent[] } | null;
  };
};
