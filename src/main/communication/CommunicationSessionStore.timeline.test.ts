import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord, RecordingTimelineEntry } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-timeline-store-test-'));

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

function entry(atSeconds: number, kind: RecordingTimelineEntry['kind'] = 'chunkRecorded'): RecordingTimelineEntry {
  return { atSeconds, kind, mediaKind: 'audio' };
}

beforeEach(() => {
  communicationSessionStore.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationSessionStore — Timeline Indexing (Phase 2)', () => {
  it('appendTimelineEntry + readTimelineEntries round-trips in append order', () => {
    const record = communicationSessionStore.create(makeRecord('tl-roundtrip'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(0, 'recordingStarted'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(2));
    communicationSessionStore.appendTimelineEntry(record.id, entry(4));

    const entries = communicationSessionStore.readTimelineEntries(record.id);
    expect(entries).toEqual([entry(0, 'recordingStarted'), entry(2), entry(4)]);
  });

  it('readTimelineEntries returns an empty array when no timeline file exists yet', () => {
    const record = communicationSessionStore.create(makeRecord('tl-empty'));
    expect(communicationSessionStore.readTimelineEntries(record.id)).toEqual([]);
  });

  it('readTimelineEntries stops at a truncated trailing line rather than throwing or skipping past it', () => {
    const record = communicationSessionStore.create(makeRecord('tl-truncated'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(0, 'recordingStarted'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(2));
    const filePath = path.join(communicationSessionStore.folderFor(record.id), 'recording-timeline.jsonl');
    // Simulate a crash mid-write: append a few stray bytes of a third, half-written JSON line.
    fs.appendFileSync(filePath, '{"atSeconds":4,"kind":"chunkRe');

    const entries = communicationSessionStore.readTimelineEntries(record.id);
    expect(entries).toEqual([entry(0, 'recordingStarted'), entry(2)]);
  });

  it('repairTimelineIndex truncates a half-written trailing line, keeping every valid entry before it', () => {
    const record = communicationSessionStore.create(makeRecord('tl-repair'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(0, 'recordingStarted'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(2));
    const filePath = path.join(communicationSessionStore.folderFor(record.id), 'recording-timeline.jsonl');
    fs.appendFileSync(filePath, '{"atSeconds":4,"kind":"chunkRe');

    communicationSessionStore.repairTimelineIndex(record.id);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw.trim().split('\n')).toHaveLength(2);
    expect(communicationSessionStore.readTimelineEntries(record.id)).toEqual([entry(0, 'recordingStarted'), entry(2)]);
  });

  it('repairTimelineIndex is idempotent — re-running against an already-valid file reproduces it byte-for-byte', () => {
    const record = communicationSessionStore.create(makeRecord('tl-repair-idempotent'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(0, 'recordingStarted'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(2));
    const filePath = path.join(communicationSessionStore.folderFor(record.id), 'recording-timeline.jsonl');
    const before = fs.readFileSync(filePath, 'utf-8');

    communicationSessionStore.repairTimelineIndex(record.id);
    communicationSessionStore.repairTimelineIndex(record.id);

    expect(fs.readFileSync(filePath, 'utf-8')).toBe(before);
  });

  it('repairTimelineIndex is a safe no-op when no timeline file exists yet', () => {
    const record = communicationSessionStore.create(makeRecord('tl-repair-missing'));
    expect(() => communicationSessionStore.repairTimelineIndex(record.id)).not.toThrow();
    expect(communicationSessionStore.readTimelineEntries(record.id)).toEqual([]);
  });

  it('supports multi-hour recordings — appending thousands of entries never gets slower per-entry as the file grows (no read-modify-write of the whole file hiding in the write path)', () => {
    const record = communicationSessionStore.create(makeRecord('tl-long-duration'));
    // A 4-hour recording at the real 2-second chunk cadence produces ~7200 chunk entries. Measured
    // as first-half-vs-second-half per-append cost rather than an absolute wall-clock bound, since
    // an absolute bound is inherently flaky under CI/parallel-test-suite CPU contention — a
    // per-append-cost ratio is not: if appendTimelineEntry() were secretly a read-modify-write of
    // the whole growing file (O(n) per call, O(n^2) overall), the second half's per-append cost
    // would be roughly 3x the first half's (average file size triples); a real O(1) append keeps the
    // ratio near 1 regardless of overall machine load.
    const chunkCount = 6000;
    const half = chunkCount / 2;

    const firstHalfStart = Date.now();
    for (let i = 0; i < half; i++) communicationSessionStore.appendTimelineEntry(record.id, entry(i * 2));
    const firstHalfMs = Date.now() - firstHalfStart;

    const secondHalfStart = Date.now();
    for (let i = half; i < chunkCount; i++) communicationSessionStore.appendTimelineEntry(record.id, entry(i * 2));
    const secondHalfMs = Date.now() - secondHalfStart;

    // Generous ratio bound (a real O(n) read-modify-write would show ~3x, not ~1x) — allows for
    // normal timing noise without allowing genuine quadratic behavior to pass.
    expect(secondHalfMs).toBeLessThan(Math.max(firstHalfMs, 20) * 2.5);

    const entries = communicationSessionStore.readTimelineEntries(record.id);
    expect(entries).toHaveLength(chunkCount);
    expect(entries[0]).toEqual(entry(0));
    expect(entries[chunkCount - 1]).toEqual(entry((chunkCount - 1) * 2));
  });

  it('the timeline index is a separate file from the recording media — never touches audio/video bytes', () => {
    const record = communicationSessionStore.create(makeRecord('tl-separate-file'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('real audio bytes'));
    communicationSessionStore.appendTimelineEntry(record.id, entry(0, 'recordingStarted'));

    const audioPartial = communicationSessionStore.readPartialRecording(record.id, 'audio');
    expect(audioPartial?.toString()).toBe('real audio bytes'); // untouched by the timeline write
    expect(communicationSessionStore.readTimelineEntries(record.id)).toEqual([entry(0, 'recordingStarted')]);
  });
});
