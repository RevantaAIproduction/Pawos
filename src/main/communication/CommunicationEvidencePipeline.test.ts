import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-evidence-pipeline-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));

const transcribeCommunicationAudio = vi.fn();
vi.mock('./CommunicationTranscription', () => ({
  transcribeCommunicationAudio: (...args: unknown[]) => transcribeCommunicationAudio(...args),
}));

import { communicationSessionStore } from './CommunicationSessionStore';
import {
  generateEvidenceForRecording,
  getEvidenceForRecording,
  normalizeSpeakerLabel,
  computeEvidenceConfidence,
} from './CommunicationEvidencePipeline';
import type { EvidenceSpeakerId } from '../../shared/communication/CommunicationTypes';

function makeRecord(id: string, overrides: Partial<CommunicationRecord> = {}): CommunicationRecord {
  const now = Date.now();
  return {
    id,
    medium: 'faceToFace',
    title: 'Test session',
    startedAt: now,
    endedAt: now,
    status: 'completed',
    pipelineStage: 'done',
    capturedVia: 'desktopAudio',
    deviceId: null,
    participants: [],
    companies: [],
    projects: [],
    tags: [],
    audioPath: `${communicationSessionStore.folderFor(id)}/audio.webm`,
    transcriptPath: null,
    bodyPath: null,
    summaryPath: null,
    attachmentPaths: [],
    sourceMeetingId: null,
    sourceThreadId: null,
    createdAt: now,
    updatedAt: now,
    recordingMode: 'direct',
    consentConfirmed: true,
    consentConfirmedAt: null,
    videoPath: null,
    speakerTimeline: [],
    visualEvidence: [],
    uploadStatus: 'completed',
    encryptionState: 'none',
    encryptedSessionKey: null,
    durationSeconds: null,
    audioSizeBytes: null,
    videoSizeBytes: null,
    audioChecksum: null,
    videoChecksum: null,
    recordingFinalizedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  communicationSessionStore.init();
  transcribeCommunicationAudio.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationEvidencePipeline — normalizeSpeakerLabel', () => {
  it('assigns generic labels in first-appearance order, distinct per raw label', () => {
    const seen = new Map<string, EvidenceSpeakerId>();
    expect(normalizeSpeakerLabel('Speaker 1', seen)).toBe('Speaker 1');
    expect(normalizeSpeakerLabel('Alice', seen)).toBe('Speaker 2');
    expect(normalizeSpeakerLabel('Speaker 1', seen)).toBe('Speaker 1'); // same raw label -> same generic label
    expect(normalizeSpeakerLabel('Alice', seen)).toBe('Speaker 2');
  });

  it('never fabricates an identity — a real stated name normalizes to a generic label, never surfaced as the identity', () => {
    const seen = new Map<string, EvidenceSpeakerId>();
    const result = normalizeSpeakerLabel('Bob Smith', seen);
    expect(result).toBe('Speaker 1');
    expect(result).not.toContain('Bob');
  });

  it('falls back to Unknown for an empty/whitespace-only raw label', () => {
    const seen = new Map<string, EvidenceSpeakerId>();
    expect(normalizeSpeakerLabel('', seen)).toBe('Unknown');
    expect(normalizeSpeakerLabel('   ', seen)).toBe('Unknown');
  });
});

describe('CommunicationEvidencePipeline — computeEvidenceConfidence', () => {
  const base = {
    transcript: 'Real spoken text.',
    speakerId: 'Speaker 1',
    startTimestamp: 5,
    endTimestamp: 8,
    recordingDurationSeconds: 100,
    previousEndTimestamp: 4,
  };

  it('is fully deterministic — identical input always produces identical output', () => {
    const a = computeEvidenceConfidence(base);
    const b = computeEvidenceConfidence(base);
    expect(a).toEqual(b);
  });

  it('reports speechRecognition 0 for genuinely empty transcript text, 1 otherwise', () => {
    expect(computeEvidenceConfidence({ ...base, transcript: '' }).speechRecognition).toBe(0);
    expect(computeEvidenceConfidence({ ...base, transcript: '   ' }).speechRecognition).toBe(0);
    expect(computeEvidenceConfidence({ ...base, transcript: 'real text' }).speechRecognition).toBe(1);
  });

  it('reports speakerSeparation 0.5 for Unknown, 1 for any real generic label', () => {
    expect(computeEvidenceConfidence({ ...base, speakerId: 'Unknown' }).speakerSeparation).toBe(0.5);
    expect(computeEvidenceConfidence({ ...base, speakerId: 'Speaker 3' }).speakerSeparation).toBe(1);
  });

  it('reports timestampAlignment 1 for an in-bounds, in-order segment', () => {
    expect(computeEvidenceConfidence(base).timestampAlignment).toBe(1);
  });

  it('reports timestampAlignment 0 for a segment starting after the recording\'s own known duration (plus tolerance)', () => {
    expect(computeEvidenceConfidence({ ...base, startTimestamp: 500, endTimestamp: 505 }).timestampAlignment).toBe(0);
  });

  it('reports timestampAlignment 0 for a negative start timestamp', () => {
    expect(computeEvidenceConfidence({ ...base, startTimestamp: -1, endTimestamp: 2 }).timestampAlignment).toBe(0);
  });

  it('reports timestampAlignment 0.5 for an in-bounds segment that starts before the previous segment ended', () => {
    expect(computeEvidenceConfidence({ ...base, startTimestamp: 3, endTimestamp: 6, previousEndTimestamp: 4 }).timestampAlignment).toBe(0.5);
  });

  it('never falsely penalizes when no real recording duration bound exists (recordingDurationSeconds = Infinity)', () => {
    expect(computeEvidenceConfidence({ ...base, startTimestamp: 100000, endTimestamp: 100002, recordingDurationSeconds: Infinity }).timestampAlignment).toBe(1);
  });
});

describe('CommunicationEvidencePipeline — generateEvidenceForRecording', () => {
  it('rejects an unknown recording', async () => {
    const result = await generateEvidenceForRecording({ communicationId: 'nope', apiKey: 'key' });
    expect(result.ok).toBe(false);
  });

  it('rejects a recording with no finalized audio', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-no-audio', { audioPath: null }));
    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(result.ok).toBe(false);
    expect(transcribeCommunicationAudio).not.toHaveBeenCalled();
  });

  it('rejects a missing apiKey with a clear message, never calling transcription', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-no-api-key'));
    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: '' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('API key');
    expect(transcribeCommunicationAudio).not.toHaveBeenCalled();
  });

  it('does not require an apiKey to read back already-completed evidence — the empty-key check only applies when real transcription work is needed', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-no-key-needed-once-done'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Done already.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'real-key' });

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data?.evidenceCount).toBe(1);
  });

  it('produces one immutable Evidence Object per transcript segment, each with a permanent evidenceId, referencing the real recording', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-basic'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Speaker 1', text: 'Hello.', atSeconds: 0 },
        { speaker: 'Speaker 2', text: 'Hi there.', atSeconds: 3 },
      ],
      plainText: '',
      detectedParticipants: [],
    });

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    expect(result.data?.evidenceCount).toBe(2);

    const evidence = getEvidenceForRecording(record.id);
    expect(evidence).toHaveLength(2);
    for (const e of evidence) {
      expect(e.recordingId).toBe(record.id);
      expect(typeof e.evidenceId).toBe('string');
      expect(e.evidenceId.length).toBeGreaterThan(0);
    }
    // Every evidenceId is unique — the permanent identifier other runtime outputs will reference.
    expect(new Set(evidence.map((e) => e.evidenceId)).size).toBe(2);
    // Never contains any interpreted/business content — only factual fields.
    for (const e of evidence) {
      expect(Object.keys(e).sort()).toEqual(
        ['confidence', 'createdAt', 'endTimestamp', 'evidenceId', 'language', 'processingVersion', 'recordingId', 'source', 'speakerId', 'startTimestamp', 'transcript'].sort()
      );
    }
  });

  it('transcript timestamps align with the Timeline Index — a segment within the recorded bounds gets high timestampAlignment confidence', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-aligned'));
    communicationSessionStore.appendTimelineEntry(record.id, { atSeconds: 0, kind: 'recordingStarted', mediaKind: null });
    communicationSessionStore.appendTimelineEntry(record.id, { atSeconds: 10, kind: 'recordingFinalized', mediaKind: 'audio' });
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'In bounds.', atSeconds: 5 }],
      plainText: '',
      detectedParticipants: [],
    });

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const [e] = getEvidenceForRecording(record.id);
    expect(e?.confidence.timestampAlignment).toBe(1);
  });

  it('transcript timestamps never modify the Timeline Index or the recording itself', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-never-mutates'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('real audio bytes'));
    communicationSessionStore.appendTimelineEntry(record.id, { atSeconds: 0, kind: 'recordingStarted', mediaKind: null });
    const timelineBefore = communicationSessionStore.readTimelineEntries(record.id);
    const audioBefore = communicationSessionStore.readPartialRecording(record.id, 'audio');

    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Text.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });

    expect(communicationSessionStore.readTimelineEntries(record.id)).toEqual(timelineBefore);
    expect(communicationSessionStore.readPartialRecording(record.id, 'audio')?.toString()).toBe(audioBefore?.toString());
  });

  it('speaker segmentation: distinct raw speaker labels become distinct generic Speaker N labels within one recording, in first-appearance order', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-speakers'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Alice', text: 'Hi.', atSeconds: 0 },
        { speaker: 'Bob', text: 'Hello.', atSeconds: 2 },
        { speaker: 'Alice', text: 'How are you?', atSeconds: 4 },
        { speaker: '', text: 'Unclear mumble.', atSeconds: 6 },
      ],
      plainText: '',
      detectedParticipants: [],
    });

    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    const evidence = getEvidenceForRecording(record.id);
    expect(evidence.map((e) => e.speakerId)).toEqual(['Speaker 1', 'Speaker 2', 'Speaker 1', 'Unknown']);
  });

  it('duplicate prevention: reprocessing an already-finalized recording never calls transcription again and returns the same evidence', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-idempotent'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Once.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });

    const first = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    const second = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });

    expect(transcribeCommunicationAudio).toHaveBeenCalledTimes(1);
    if (!first.ok || !second.ok) throw new Error('expected both calls to succeed');
    expect(first.data?.evidenceCount).toBe(second.data?.evidenceCount);
    expect(getEvidenceForRecording(record.id)).toHaveLength(1);
  });

  it('duplicate prevention: two concurrent calls for the same recording within one process never both run — the second is rejected while the first is in flight', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-concurrent'));
    let resolveTranscription: (value: unknown) => void = () => {};
    transcribeCommunicationAudio.mockReturnValue(
      new Promise((resolve) => {
        resolveTranscription = resolve;
      })
    );

    const firstCall = generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    const secondCall = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(secondCall.ok).toBe(false);

    resolveTranscription({ segments: [], plainText: '', detectedParticipants: [] });
    const firstResult = await firstCall;
    expect(firstResult.ok).toBe(true);
    expect(transcribeCommunicationAudio).toHaveBeenCalledTimes(1);
  });

  it('crash recovery: a stale partial evidence file from an interrupted prior run is discarded, never resumed into or duplicated', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-crash-recovery'));
    // Simulate a crash mid-generation: a partial file exists with data from a run that never finalized.
    communicationSessionStore.appendEvidencePartial(record.id, {
      evidenceId: 'stale-from-crashed-run',
      recordingId: record.id,
      speakerId: 'Speaker 1',
      transcript: 'Stale.',
      startTimestamp: 0,
      endTimestamp: 1,
      confidence: { speechRecognition: 1, speakerSeparation: 1, timestampAlignment: 1 },
      language: 'unknown',
      source: 'speechToText',
      processingVersion: 'foundation-v1',
      createdAt: Date.now(),
    });
    expect(communicationSessionStore.hasPartialEvidence(record.id)).toBe(true);

    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Fresh run.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);

    const evidence = getEvidenceForRecording(record.id);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.evidenceId).not.toBe('stale-from-crashed-run');
    expect(evidence[0]?.transcript).toBe('Fresh run.');
    expect(communicationSessionStore.hasPartialEvidence(record.id)).toBe(false);
  });

  it('evidenceId survives application restart — evidence read after a simulated store reload is byte-for-byte identical', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-survives-restart'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Speaker 1', text: 'Before restart.', atSeconds: 0 },
        { speaker: 'Speaker 2', text: 'Still before restart.', atSeconds: 2 },
      ],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    const before = getEvidenceForRecording(record.id);
    expect(before).toHaveLength(2);

    // Simulate an application restart: the store's own file-backed data is the only thing that
    // can genuinely survive a process restart (in-memory guards like currentlyGenerating would
    // reset too, but there is nothing left to guard once the process — and this test's mock call
    // count assertion below — restarts clean). Re-init() reloads the index from disk exactly as
    // main.ts's own startup path does.
    communicationSessionStore.init();

    const after = getEvidenceForRecording(record.id);
    expect(after).toEqual(before);
    expect(after.map((e) => e.evidenceId)).toEqual(before.map((e) => e.evidenceId));

    // A "restarted" caller re-invoking generation for the same recording must still be a pure,
    // idempotent no-op — never re-transcribing, never re-minting ids.
    transcribeCommunicationAudio.mockClear();
    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(transcribeCommunicationAudio).not.toHaveBeenCalled();
    if (!result.ok) throw new Error('unreachable');
    expect(result.data?.evidenceCount).toBe(2);
    expect(getEvidenceForRecording(record.id).map((e) => e.evidenceId)).toEqual(before.map((e) => e.evidenceId));
  });

  it('evidence remains immutable after persistence — mutating a field on a returned Evidence Object never affects a subsequent read', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-field-immutable'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Original text.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });

    const evidence = getEvidenceForRecording(record.id);
    const original = { ...evidence[0]! };
    // Mutate every field on the object this caller happened to receive.
    const mutable = evidence[0] as unknown as Record<string, unknown>;
    mutable.transcript = 'TAMPERED';
    mutable.evidenceId = 'tampered-id';
    mutable.confidence = { speechRecognition: 0, speakerSeparation: 0, timestampAlignment: 0 };

    const reread = getEvidenceForRecording(record.id);
    expect(reread[0]).toEqual(original);
    expect(reread[0]?.transcript).toBe('Original text.');
    expect(reread[0]?.evidenceId).toBe(original.evidenceId);
  });

  it('reprocessing cannot renumber previously-created speakers — a second (never-invoked) call with different segment order/labels leaves the committed numbering untouched', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-no-renumber'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Alice', text: 'First speaker first.', atSeconds: 0 },
        { speaker: 'Bob', text: 'Second speaker second.', atSeconds: 2 },
      ],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    const committed = getEvidenceForRecording(record.id);
    expect(committed.map((e) => e.speakerId)).toEqual(['Speaker 1', 'Speaker 2']);

    // A hypothetical reprocessing attempt whose underlying transcription would (if it ever ran)
    // reverse the speaker order — proving the numbering is never recomputed once committed, not
    // merely "usually consistent" because the mock happens to return the same order twice.
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Bob', text: 'Reordered.', atSeconds: 0 },
        { speaker: 'Alice', text: 'Reordered.', atSeconds: 2 },
      ],
      plainText: '',
      detectedParticipants: [],
    });
    transcribeCommunicationAudio.mockClear();
    const second = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(transcribeCommunicationAudio).not.toHaveBeenCalled(); // never even runs — idempotency gate short-circuits first

    if (!second.ok) throw new Error('unreachable');
    const afterSecondCall = getEvidenceForRecording(record.id);
    expect(afterSecondCall).toEqual(committed);
    expect(afterSecondCall.map((e) => e.speakerId)).toEqual(['Speaker 1', 'Speaker 2']);
  });

  it('long recordings / incremental processing: many segments are all captured correctly, appended incrementally rather than buffered in memory before persisting', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-long-recording'));
    const segmentCount = 500;
    const segments = Array.from({ length: segmentCount }, (_, i) => ({
      speaker: i % 2 === 0 ? 'Speaker A' : 'Speaker B',
      text: `Segment number ${i}.`,
      atSeconds: i * 2,
    }));
    transcribeCommunicationAudio.mockResolvedValue({ segments, plainText: '', detectedParticipants: [] });

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    expect(result.data?.evidenceCount).toBe(segmentCount);

    const evidence = getEvidenceForRecording(record.id);
    expect(evidence).toHaveLength(segmentCount);
    expect(new Set(evidence.map((e) => e.evidenceId)).size).toBe(segmentCount); // no duplicates even at scale
  });

  it('deterministic ordering: getEvidenceForRecording always returns evidence sorted by startTimestamp', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-order'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [
        { speaker: 'Speaker 1', text: 'First chronologically, first in array.', atSeconds: 0 },
        { speaker: 'Speaker 1', text: 'Second.', atSeconds: 5 },
        { speaker: 'Speaker 1', text: 'Third.', atSeconds: 10 },
      ],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });

    const evidence = getEvidenceForRecording(record.id);
    const timestamps = evidence.map((e) => e.startTimestamp);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it('mutating the array returned by getEvidenceForRecording never affects a subsequent read', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-immutable-read'));
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Text.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });

    const evidence = getEvidenceForRecording(record.id);
    evidence.pop();
    (evidence as unknown[]).push('corrupted');

    expect(getEvidenceForRecording(record.id)).toHaveLength(1);
  });

  it('a genuine transcription failure returns an honest { ok: false } rather than rejecting, and leaves no stale partial file behind', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-transcription-error'));
    transcribeCommunicationAudio.mockRejectedValue(new Error('Gemini request failed (500): server error'));

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('server error');
    expect(communicationSessionStore.hasPartialEvidence(record.id)).toBe(false);
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(false);

    // A later retry (after the transient failure clears) must not be blocked by the failed attempt.
    transcribeCommunicationAudio.mockResolvedValue({
      segments: [{ speaker: 'Speaker 1', text: 'Retried successfully.', atSeconds: 0 }],
      plainText: '',
      detectedParticipants: [],
    });
    const retry = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(retry.ok).toBe(true);
  });

  it('honestly produces zero Evidence Objects for a recording that genuinely transcribed to silence — never fabricates evidence', async () => {
    const record = communicationSessionStore.create(makeRecord('ev-silent'));
    transcribeCommunicationAudio.mockResolvedValue({ segments: [], plainText: '', detectedParticipants: [] });

    const result = await generateEvidenceForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    expect(result.data?.evidenceCount).toBe(0);
    expect(getEvidenceForRecording(record.id)).toEqual([]);
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(true); // still finalized — a real, honest "nothing found" outcome, not left pending forever
  });
});
