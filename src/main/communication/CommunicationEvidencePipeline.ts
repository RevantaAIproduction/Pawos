import { v4 as uuidv4 } from 'uuid';
import { communicationSessionStore } from './CommunicationSessionStore';
import { transcribeCommunicationAudio, type TranscriptSegment } from './CommunicationTranscription';
import type {
  AdapterResult,
  EvidenceConfidence,
  EvidenceObject,
  EvidenceSpeakerId,
} from '../../shared/communication/CommunicationTypes';

/**
 * Foundation Intelligence (Communication Intelligence Runtime, Phase 3A) —
 * wraps the existing, unmodified, real Gemini-backed transcription call
 * (CommunicationTranscription.ts, frozen since an earlier initiative) into
 * immutable, evidenceId-bearing Evidence Objects. Deliberately does NOT touch
 * or expand summarizeCommunication()/extractActionItems()/
 * detectCommunicationSignals() in that file — those are Phase 3B (Business
 * Intelligence) territory. This file produces ONLY factual output: transcript
 * text, a generic speaker label, timestamps aligned to the Phase 2 Timeline
 * Index, and a deterministic, rule-based confidence — never a decision,
 * requirement, opportunity, risk, or any other interpreted meaning.
 */

const PROCESSING_VERSION = 'foundation-v1';

/**
 * Small, disclosed tolerance for the Phase 2 Timeline Index's own already-documented
 * approximation (chunk/finalize timestamps are computed at main-process IPC-arrival
 * time, not exact renderer-side capture time) — without this, a transcript segment
 * landing a fraction of a second past the timeline's last known bound would be
 * penalized for a timing discrepancy that has nothing to do with transcription
 * or alignment quality.
 */
const TIMESTAMP_TOLERANCE_SECONDS = 2;

/**
 * Deterministic, per-recording speaker-label normalization. The underlying,
 * reused transcription call may return "Speaker 2" or a real stated name (its
 * own prompt allows "or their actual names if stated aloud") — this function
 * normalizes WHATEVER raw label it returns into a purely generic "Speaker N"
 * (or "Unknown") label, keyed by first-appearance order within one recording.
 * This is Phase 3A's own additive discipline layered on top of the reused
 * (frozen, untouched) transcription prompt: "Support: Speaker 1, Speaker 2,
 * Speaker N. Never fabricate identities." Real name/identity resolution is
 * explicitly deferred to a later phase — this function only distinguishes
 * distinct voices, it never asserts who they are.
 */
export function normalizeSpeakerLabel(rawLabel: string, seen: Map<string, EvidenceSpeakerId>): EvidenceSpeakerId {
  const trimmed = rawLabel.trim();
  if (!trimmed) return 'Unknown';
  const existing = seen.get(trimmed);
  if (existing) return existing;
  const assigned = `Speaker ${seen.size + 1}`;
  seen.set(trimmed, assigned);
  return assigned;
}

/**
 * Deterministic, rule-based confidence over structural properties of already-parsed
 * transcription output — never a fabricated ML-calibrated probability the underlying
 * pipeline doesn't actually produce. Re-running against the same input always yields
 * the same three numbers (a hard verification requirement: confidence must remain
 * deterministic). Covers exactly the three dimensions Phase 3A is scoped to: speech
 * recognition, speaker separation, timestamp alignment — never a business-confidence
 * score, which belongs exclusively to Phase 3B.
 */
export function computeEvidenceConfidence(params: {
  transcript: string;
  speakerId: EvidenceSpeakerId;
  startTimestamp: number;
  endTimestamp: number;
  recordingDurationSeconds: number;
  previousEndTimestamp: number | null;
}): EvidenceConfidence {
  const speechRecognition = params.transcript.trim().length > 0 ? 1 : 0;
  const speakerSeparation = params.speakerId === 'Unknown' ? 0.5 : 1;

  const withinBounds =
    params.startTimestamp >= 0 &&
    params.endTimestamp >= params.startTimestamp &&
    params.startTimestamp <= params.recordingDurationSeconds + TIMESTAMP_TOLERANCE_SECONDS;

  let timestampAlignment: number;
  if (!withinBounds) {
    timestampAlignment = 0;
  } else if (params.previousEndTimestamp !== null && params.startTimestamp < params.previousEndTimestamp) {
    timestampAlignment = 0.5; // in bounds, but out of order relative to the previous segment
  } else {
    timestampAlignment = 1;
  }

  return { speechRecognition, speakerSeparation, timestampAlignment };
}

/**
 * The recording's own known duration, per the Phase 2 Timeline Index — reusing the
 * approved Timeline Index as the ground truth for alignment verification, exactly as
 * instructed, rather than depending on CommunicationRecord.durationSeconds (which is
 * not populated by the current Recording & Storage Foundation). A session with no
 * timeline at all (e.g. one recorded before Phase 2 existed) has no real bound to
 * check against — returns +Infinity so its evidence is never falsely penalized for
 * an "out of bounds" timestamp derived from a bound that was never real.
 */
function getRecordingDurationSeconds(communicationId: string): number {
  const entries = communicationSessionStore.readTimelineEntries(communicationId);
  if (entries.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(...entries.map((e) => e.atSeconds));
}

/**
 * The transcription call reports only a single atSeconds per segment (no separate
 * start/end pair). endTimestamp is derived deterministically: the next segment's own
 * start (the real evidence that this segment truly ended there), or — for the last
 * segment — the recording's own known duration if that's a real, later bound, or
 * else the segment's own start (an honest zero-length fallback when no better bound
 * exists, never a fabricated duration).
 */
function deriveEndTimestamp(currentSegment: TranscriptSegment, nextSegment: TranscriptSegment | undefined, recordingDurationSeconds: number): number {
  const start = Math.max(0, currentSegment.atSeconds);
  if (nextSegment && nextSegment.atSeconds > start) return nextSegment.atSeconds;
  if (Number.isFinite(recordingDurationSeconds) && recordingDurationSeconds > start) return recordingDurationSeconds;
  return start;
}

/** In-memory, per-process guard against two concurrent generation runs for the same recording within one process lifetime — the file-existence checks in CommunicationSessionStore (hasEvidence/hasPartialEvidence) already guard across separate process lifetimes (a crash + restart), but a same-process double-invocation (e.g. a UI double-click) needs its own guard, since there's no file-based signal for "currently running right now." */
const currentlyGenerating = new Set<string>();

/**
 * Generates Evidence Objects for one finalized recording — the entry point for
 * Foundation Intelligence. Deliberately a standalone, explicitly-invoked, async
 * function, never called from any Phase 1 recording-lifecycle method
 * (startCapture/appendRecordingChunk/finalizeRecording/pauseCapture/resumeCapture/
 * recoverInterruptedRecordings) or any Phase 2 timeline method — "recording must
 * never wait for AI, timeline generation must never wait for AI" is satisfied
 * structurally: there is no call path from those methods into this one.
 *
 * Idempotent by construction: if evidence.jsonl already exists, returns immediately
 * with its real count, never reprocessing. Crash-safe by construction: always
 * discards any stale .partial file from an interrupted prior run before starting,
 * so a resumed/retried generation attempt never resumes into unknown partial state
 * or duplicates already-durable evidence (re-running the underlying transcription
 * call is always safe, since the source recording itself is untouched).
 */
export async function generateEvidenceForRecording(params: {
  communicationId: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<AdapterResult<{ evidenceCount: number }>> {
  const { communicationId, apiKey } = params;
  const record = communicationSessionStore.get(communicationId);
  if (!record) return { ok: false, message: 'Communication not found.' };
  if (!record.audioPath) return { ok: false, message: 'This recording has no finalized audio to process yet.' };

  if (communicationSessionStore.hasEvidence(communicationId)) {
    return { ok: true, data: { evidenceCount: communicationSessionStore.readEvidence(communicationId).length } };
  }
  if (currentlyGenerating.has(communicationId)) {
    return { ok: false, message: 'Evidence generation is already in progress for this recording.' };
  }
  // Checked only once we know real transcription work is actually needed (an already-finalized or
  // already-in-progress recording is handled above without ever requiring a key) — mirrors
  // ProcessCommunicationPlugin's own explicit apiKey validation for the same underlying Gemini call.
  if (!apiKey) return { ok: false, message: 'No Gemini API key configured.' };

  currentlyGenerating.add(communicationId);
  try {
    // Always start from a clean slate — a stale .partial file here can only be
    // leftover from a previous run that never reached finalizeEvidence() (a crash,
    // or this exact process having been killed mid-generation on an earlier attempt).
    communicationSessionStore.discardPartialEvidence(communicationId);

    const transcription = await transcribeCommunicationAudio({
      apiKey,
      audioPath: record.audioPath,
      communicationId,
      model: params.model,
      baseUrl: params.baseUrl,
    });

    const recordingDurationSeconds = getRecordingDurationSeconds(communicationId);
    const speakerLabels = new Map<string, EvidenceSpeakerId>();
    let previousEndTimestamp: number | null = null;
    let evidenceCount = 0;

    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i]!;
      const speakerId = normalizeSpeakerLabel(segment.speaker, speakerLabels);
      const startTimestamp = Math.max(0, segment.atSeconds);
      const endTimestamp = deriveEndTimestamp(segment, transcription.segments[i + 1], recordingDurationSeconds);
      const confidence = computeEvidenceConfidence({
        transcript: segment.text,
        speakerId,
        startTimestamp,
        endTimestamp,
        recordingDurationSeconds,
        previousEndTimestamp,
      });

      const evidence: EvidenceObject = {
        evidenceId: uuidv4(),
        recordingId: communicationId,
        speakerId,
        transcript: segment.text,
        startTimestamp,
        endTimestamp,
        confidence,
        // The transcription call does not currently report a detected language —
        // honestly 'unknown' rather than an assumed default, per this codebase's
        // "never claim more certainty than the technique supports" discipline.
        language: 'unknown',
        source: 'speechToText',
        processingVersion: PROCESSING_VERSION,
        createdAt: Date.now(),
      };
      communicationSessionStore.appendEvidencePartial(communicationId, evidence);
      previousEndTimestamp = endTimestamp;
      evidenceCount++;
    }

    communicationSessionStore.finalizeEvidence(communicationId);
    return { ok: true, data: { evidenceCount } };
  } catch (error) {
    // A genuine failure (e.g. a Gemini network/API error) must never leave a
    // half-written .partial file lying around masquerading as a future resumable
    // state — discard it so the next attempt starts from a clean slate, exactly
    // like the crash-recovery path. Reported as an honest { ok: false }, matching
    // every other AdapterResult-returning method in this codebase (e.g.
    // CommunicationPipeline.run()) rather than rejecting the returned promise.
    communicationSessionStore.discardPartialEvidence(communicationId);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Evidence generation failed: ${message}` };
  } finally {
    currentlyGenerating.delete(communicationId);
  }
}

/** Read-only accessor — returns every finalized Evidence Object for a recording, sorted by startTimestamp (a real guarantee for every consumer, not just raw write order), mirroring getRecordingTimeline()'s exact read-time-sort discipline from Phase 2. */
export function getEvidenceForRecording(communicationId: string): EvidenceObject[] {
  return [...communicationSessionStore.readEvidence(communicationId)].sort((a, b) => a.startTimestamp - b.startTimestamp);
}
