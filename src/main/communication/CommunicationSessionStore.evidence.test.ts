import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord, EvidenceObject } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-evidence-store-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));

import { communicationSessionStore } from './CommunicationSessionStore';

function makeRecord(id: string): CommunicationRecord {
  const now = Date.now();
  return {
    id,
    medium: 'faceToFace',
    title: 'Test session',
    startedAt: now,
    endedAt: null,
    status: 'recording',
    pipelineStage: 'transcribing',
    capturedVia: 'desktopAudio',
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
}

function evidence(overrides: Partial<EvidenceObject> = {}): EvidenceObject {
  return {
    evidenceId: `ev-${Math.random().toString(36).slice(2)}`,
    recordingId: 'unused',
    speakerId: 'Speaker 1',
    transcript: 'Hello there.',
    startTimestamp: 0,
    endTimestamp: 2,
    confidence: { speechRecognition: 1, speakerSeparation: 1, timestampAlignment: 1 },
    language: 'unknown',
    source: 'speechToText',
    processingVersion: 'foundation-v1',
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  communicationSessionStore.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationSessionStore — Evidence Objects (Phase 3A)', () => {
  it('appendEvidencePartial + finalizeEvidence + readEvidence round-trips in append order', () => {
    const record = communicationSessionStore.create(makeRecord('ev-roundtrip'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: 'e1', startTimestamp: 0, endTimestamp: 2 }));
    communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: 'e2', startTimestamp: 2, endTimestamp: 4 }));
    communicationSessionStore.finalizeEvidence(record.id);

    const entries = communicationSessionStore.readEvidence(record.id);
    expect(entries.map((e) => e.evidenceId)).toEqual(['e1', 'e2']);
  });

  it('hasEvidence is false before finalization and true after', () => {
    const record = communicationSessionStore.create(makeRecord('ev-has'));
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(false);
    communicationSessionStore.appendEvidencePartial(record.id, evidence());
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(false); // still only partial — never treated as real until finalized
    communicationSessionStore.finalizeEvidence(record.id);
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(true);
  });

  it('readEvidence returns an empty array when nothing has been finalized yet, even if a partial file exists', () => {
    const record = communicationSessionStore.create(makeRecord('ev-partial-not-real'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence());
    expect(communicationSessionStore.readEvidence(record.id)).toEqual([]);
  });

  it('finalizeEvidence renames the partial file atomically — no intermediate state where both or neither file exists incorrectly', () => {
    const record = communicationSessionStore.create(makeRecord('ev-atomic'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence());
    const folder = communicationSessionStore.folderFor(record.id);
    expect(fs.existsSync(path.join(folder, 'evidence.partial.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(folder, 'evidence.jsonl'))).toBe(false);

    communicationSessionStore.finalizeEvidence(record.id);
    expect(fs.existsSync(path.join(folder, 'evidence.partial.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(folder, 'evidence.jsonl'))).toBe(true);
  });

  it('finalizeEvidence honestly writes an empty finalized file when zero evidence objects were ever appended (e.g. a silent recording)', () => {
    const record = communicationSessionStore.create(makeRecord('ev-empty'));
    communicationSessionStore.finalizeEvidence(record.id);
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(true);
    expect(communicationSessionStore.readEvidence(record.id)).toEqual([]);
  });

  it('finalizeEvidence is a no-op once evidence is already finalized — never overwrites real, completed evidence', () => {
    const record = communicationSessionStore.create(makeRecord('ev-no-overwrite'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: 'first' }));
    communicationSessionStore.finalizeEvidence(record.id);

    // A stray second finalize call (e.g. a defensive double-call) must never touch the already-real file.
    communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: 'stray-should-never-be-seen' }));
    communicationSessionStore.finalizeEvidence(record.id);

    expect(communicationSessionStore.readEvidence(record.id).map((e) => e.evidenceId)).toEqual(['first']);
  });

  it('discardPartialEvidence removes a stale partial file — the crash-recovery mechanism', () => {
    const record = communicationSessionStore.create(makeRecord('ev-discard'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence());
    expect(communicationSessionStore.hasPartialEvidence(record.id)).toBe(true);

    communicationSessionStore.discardPartialEvidence(record.id);
    expect(communicationSessionStore.hasPartialEvidence(record.id)).toBe(false);
    expect(communicationSessionStore.hasEvidence(record.id)).toBe(false);
  });

  it('discardPartialEvidence is a safe no-op when no partial file exists', () => {
    const record = communicationSessionStore.create(makeRecord('ev-discard-missing'));
    expect(() => communicationSessionStore.discardPartialEvidence(record.id)).not.toThrow();
  });

  it('readEvidence stops at a truncated trailing line rather than throwing or skipping past it', () => {
    const record = communicationSessionStore.create(makeRecord('ev-truncated'));
    communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: 'good' }));
    communicationSessionStore.finalizeEvidence(record.id);
    const finalPath = path.join(communicationSessionStore.folderFor(record.id), 'evidence.jsonl');
    fs.appendFileSync(finalPath, '{"evidenceId":"half-writ');

    expect(communicationSessionStore.readEvidence(record.id).map((e) => e.evidenceId)).toEqual(['good']);
  });

  it('the evidence store is a separate file from the recording timeline and media — never touches either', () => {
    const record = communicationSessionStore.create(makeRecord('ev-separate'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('real audio bytes'));
    communicationSessionStore.appendTimelineEntry(record.id, { atSeconds: 0, kind: 'recordingStarted', mediaKind: null });
    communicationSessionStore.appendEvidencePartial(record.id, evidence());
    communicationSessionStore.finalizeEvidence(record.id);

    expect(communicationSessionStore.readPartialRecording(record.id, 'audio')?.toString()).toBe('real audio bytes');
    expect(communicationSessionStore.readTimelineEntries(record.id)).toHaveLength(1);
    expect(communicationSessionStore.readEvidence(record.id)).toHaveLength(1);
  });

  it('supports long recordings — appending hundreds of evidence objects never gets slower per-entry as the file grows', () => {
    const record = communicationSessionStore.create(makeRecord('ev-long'));
    const count = 800;
    const half = count / 2;

    const firstHalfStart = Date.now();
    for (let i = 0; i < half; i++) communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: `e${i}`, startTimestamp: i * 3, endTimestamp: i * 3 + 2 }));
    const firstHalfMs = Date.now() - firstHalfStart;

    const secondHalfStart = Date.now();
    for (let i = half; i < count; i++) communicationSessionStore.appendEvidencePartial(record.id, evidence({ evidenceId: `e${i}`, startTimestamp: i * 3, endTimestamp: i * 3 + 2 }));
    const secondHalfMs = Date.now() - secondHalfStart;

    // Generous ratio bound (a real O(n) read-modify-write would show ~3x, not ~1x) — see the
    // identical, already-proven rationale in CommunicationSessionStore.timeline.test.ts.
    expect(secondHalfMs).toBeLessThan(Math.max(firstHalfMs, 20) * 2.5);

    communicationSessionStore.finalizeEvidence(record.id);
    expect(communicationSessionStore.readEvidence(record.id)).toHaveLength(count);
  });
});
