import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-session-store-test-'));

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

beforeEach(() => {
  communicationSessionStore.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationSessionStore — Recording & Storage Foundation', () => {
  it('appendRecordingChunk creates and appends to a .partial file, never the final name, until finalized', () => {
    const record = communicationSessionStore.create(makeRecord('sess-append'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('chunk-one'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('chunk-two'));

    expect(communicationSessionStore.hasPartialRecording(record.id, 'audio')).toBe(true);
    const raw = communicationSessionStore.readPartialRecording(record.id, 'audio');
    expect(raw?.toString()).toBe('chunk-onechunk-two');

    const finalPath = path.join(communicationSessionStore.folderFor(record.id), 'audio.webm');
    expect(fs.existsSync(finalPath)).toBe(false);
  });

  it('finalizeRecordingFile atomically renames the partial file and reports the real size', () => {
    const record = communicationSessionStore.create(makeRecord('sess-finalize'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('12345'));

    const result = communicationSessionStore.finalizeRecordingFile(record.id, 'audio', 'audio.webm');
    expect(result).not.toBeNull();
    expect(result!.sizeBytes).toBe(5);
    expect(fs.existsSync(result!.fullPath)).toBe(true);
    expect(communicationSessionStore.hasPartialRecording(record.id, 'audio')).toBe(false);
  });

  it('finalizeRecordingFile returns null when no chunk was ever appended — an honest no-op, not an error', () => {
    const record = communicationSessionStore.create(makeRecord('sess-empty'));
    const result = communicationSessionStore.finalizeRecordingFile(record.id, 'video', 'video.webm');
    expect(result).toBeNull();
  });

  it('computeChecksum returns a real, deterministic SHA-256 over the actual file bytes', async () => {
    const record = communicationSessionStore.create(makeRecord('sess-checksum'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('deterministic content'));
    const { fullPath } = communicationSessionStore.finalizeRecordingFile(record.id, 'audio', 'audio.webm')!;
    const checksum1 = await communicationSessionStore.computeChecksum(fullPath);
    const checksum2 = await communicationSessionStore.computeChecksum(fullPath);
    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('truncatePartialRecordingToBoundary truncates a partial file to the given byte count', () => {
    const record = communicationSessionStore.create(makeRecord('sess-truncate'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('0123456789'));
    communicationSessionStore.truncatePartialRecordingToBoundary(record.id, 'audio', 5);
    const raw = communicationSessionStore.readPartialRecording(record.id, 'audio');
    expect(raw?.toString()).toBe('01234');
  });

  it('truncatePartialRecordingToBoundary is a no-op when the file is already within the boundary', () => {
    const record = communicationSessionStore.create(makeRecord('sess-truncate-noop'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('short'));
    communicationSessionStore.truncatePartialRecordingToBoundary(record.id, 'audio', 1000);
    const raw = communicationSessionStore.readPartialRecording(record.id, 'audio');
    expect(raw?.toString()).toBe('short');
  });

  it('listStaleRecordingSessions returns only records still in status "recording"', () => {
    const stale = communicationSessionStore.create(makeRecord('sess-stale'));
    const done = communicationSessionStore.create({ ...makeRecord('sess-done'), status: 'completed' });
    const staleIds = communicationSessionStore.listStaleRecordingSessions().map((r) => r.id);
    expect(staleIds).toContain(stale.id);
    expect(staleIds).not.toContain(done.id);
  });

  it('deleteSessionCompletely removes both the index entry and the on-disk session folder', () => {
    const record = communicationSessionStore.create(makeRecord('sess-delete'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('data'));
    const folder = communicationSessionStore.folderFor(record.id);
    expect(fs.existsSync(folder)).toBe(true);

    const deleted = communicationSessionStore.deleteSessionCompletely(record.id);
    expect(deleted).toBe(true);
    expect(communicationSessionStore.get(record.id)).toBeUndefined();
    expect(fs.existsSync(folder)).toBe(false);
  });

  it('deleteSessionCompletely returns false for an unknown id and never throws', () => {
    expect(() => communicationSessionStore.deleteSessionCompletely('does-not-exist')).not.toThrow();
    expect(communicationSessionStore.deleteSessionCompletely('does-not-exist')).toBe(false);
  });

  it('legacy path migration rewrites videoPath references too, not just audioPath (regression: videoPath was previously omitted)', () => {
    const record = makeRecord('sess-legacy-video');
    const legacyVideoPath = path.join(tmp, 'communication', 'recordings', record.id, 'video.webm');
    communicationSessionStore.create({ ...record, videoPath: legacyVideoPath });
    // Re-run init() to trigger migrateLegacyPathReferences() again over the persisted record.
    communicationSessionStore.init();
    const migrated = communicationSessionStore.get(record.id);
    expect(migrated?.videoPath).not.toContain(`${path.sep}recordings${path.sep}`);
    expect(migrated?.videoPath).toContain(`${path.sep}sessions${path.sep}`);
  });
});
