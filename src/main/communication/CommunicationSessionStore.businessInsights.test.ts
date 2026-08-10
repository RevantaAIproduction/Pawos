import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord, BusinessInsight } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-business-insights-store-test-'));

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

function insight(overrides: Partial<BusinessInsight> = {}): BusinessInsight {
  return {
    insightId: `bi-${Math.random().toString(36).slice(2)}`,
    recordingId: 'unused',
    kind: 'decision',
    description: 'They decided to proceed.',
    evidenceIds: ['ev-1'],
    participant: 'Speaker 1',
    confidence: 'medium',
    sentimentLabel: null,
    processingVersion: 'business-v1',
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

describe('CommunicationSessionStore — Business Insights (Phase 3B)', () => {
  it('appendBusinessInsightPartial + finalizeBusinessInsights + readBusinessInsights round-trips in append order', () => {
    const record = communicationSessionStore.create(makeRecord('bi-roundtrip'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: 'i1' }));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: 'i2' }));
    communicationSessionStore.finalizeBusinessInsights(record.id);

    const entries = communicationSessionStore.readBusinessInsights(record.id);
    expect(entries.map((e) => e.insightId)).toEqual(['i1', 'i2']);
  });

  it('hasBusinessInsights is false before finalization and true after', () => {
    const record = communicationSessionStore.create(makeRecord('bi-has'));
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(false);
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight());
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(false);
    communicationSessionStore.finalizeBusinessInsights(record.id);
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(true);
  });

  it('readBusinessInsights returns an empty array when nothing has been finalized yet, even if a partial file exists', () => {
    const record = communicationSessionStore.create(makeRecord('bi-partial-not-real'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight());
    expect(communicationSessionStore.readBusinessInsights(record.id)).toEqual([]);
  });

  it('finalizeBusinessInsights renames the partial file atomically', () => {
    const record = communicationSessionStore.create(makeRecord('bi-atomic'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight());
    const folder = communicationSessionStore.folderFor(record.id);
    expect(fs.existsSync(path.join(folder, 'business-insights.partial.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(folder, 'business-insights.jsonl'))).toBe(false);

    communicationSessionStore.finalizeBusinessInsights(record.id);
    expect(fs.existsSync(path.join(folder, 'business-insights.partial.jsonl'))).toBe(false);
    expect(fs.existsSync(path.join(folder, 'business-insights.jsonl'))).toBe(true);
  });

  it('finalizeBusinessInsights honestly writes an empty finalized file when zero insights were ever appended', () => {
    const record = communicationSessionStore.create(makeRecord('bi-empty'));
    communicationSessionStore.finalizeBusinessInsights(record.id);
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(true);
    expect(communicationSessionStore.readBusinessInsights(record.id)).toEqual([]);
  });

  it('finalizeBusinessInsights is a no-op once already finalized — never overwrites real, completed insights', () => {
    const record = communicationSessionStore.create(makeRecord('bi-no-overwrite'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: 'first' }));
    communicationSessionStore.finalizeBusinessInsights(record.id);

    communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: 'stray-should-never-be-seen' }));
    communicationSessionStore.finalizeBusinessInsights(record.id);

    expect(communicationSessionStore.readBusinessInsights(record.id).map((e) => e.insightId)).toEqual(['first']);
  });

  it('discardPartialBusinessInsights removes a stale partial file', () => {
    const record = communicationSessionStore.create(makeRecord('bi-discard'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight());
    expect(communicationSessionStore.hasPartialBusinessInsights(record.id)).toBe(true);

    communicationSessionStore.discardPartialBusinessInsights(record.id);
    expect(communicationSessionStore.hasPartialBusinessInsights(record.id)).toBe(false);
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(false);
  });

  it('discardPartialBusinessInsights is a safe no-op when no partial file exists', () => {
    const record = communicationSessionStore.create(makeRecord('bi-discard-missing'));
    expect(() => communicationSessionStore.discardPartialBusinessInsights(record.id)).not.toThrow();
  });

  it('readBusinessInsights stops at a truncated trailing line rather than throwing or skipping past it', () => {
    const record = communicationSessionStore.create(makeRecord('bi-truncated'));
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: 'good' }));
    communicationSessionStore.finalizeBusinessInsights(record.id);
    const finalPath = path.join(communicationSessionStore.folderFor(record.id), 'business-insights.jsonl');
    fs.appendFileSync(finalPath, '{"insightId":"half-writ');

    expect(communicationSessionStore.readBusinessInsights(record.id).map((e) => e.insightId)).toEqual(['good']);
  });

  it('the business insights store is a separate file from evidence, the recording timeline, and media — never touches any of them', () => {
    const record = communicationSessionStore.create(makeRecord('bi-separate'));
    communicationSessionStore.appendRecordingChunk(record.id, 'audio', Buffer.from('real audio bytes'));
    communicationSessionStore.appendTimelineEntry(record.id, { atSeconds: 0, kind: 'recordingStarted', mediaKind: null });
    communicationSessionStore.appendEvidencePartial(record.id, {
      evidenceId: 'ev-1',
      recordingId: record.id,
      speakerId: 'Speaker 1',
      transcript: 'Hi.',
      startTimestamp: 0,
      endTimestamp: 2,
      confidence: { speechRecognition: 1, speakerSeparation: 1, timestampAlignment: 1 },
      language: 'unknown',
      source: 'speechToText',
      processingVersion: 'foundation-v1',
      createdAt: Date.now(),
    });
    communicationSessionStore.finalizeEvidence(record.id);
    communicationSessionStore.appendBusinessInsightPartial(record.id, insight());
    communicationSessionStore.finalizeBusinessInsights(record.id);

    expect(communicationSessionStore.readPartialRecording(record.id, 'audio')?.toString()).toBe('real audio bytes');
    expect(communicationSessionStore.readTimelineEntries(record.id)).toHaveLength(1);
    expect(communicationSessionStore.readEvidence(record.id)).toHaveLength(1);
    expect(communicationSessionStore.readBusinessInsights(record.id)).toHaveLength(1);
  });

  it('supports many insights — appending hundreds never gets slower per-entry as the file grows', () => {
    const record = communicationSessionStore.create(makeRecord('bi-long'));
    const count = 800;
    const half = count / 2;

    const firstHalfStart = Date.now();
    for (let i = 0; i < half; i++) communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: `i${i}` }));
    const firstHalfMs = Date.now() - firstHalfStart;

    const secondHalfStart = Date.now();
    for (let i = half; i < count; i++) communicationSessionStore.appendBusinessInsightPartial(record.id, insight({ insightId: `i${i}` }));
    const secondHalfMs = Date.now() - secondHalfStart;

    expect(secondHalfMs).toBeLessThan(Math.max(firstHalfMs, 20) * 2.5);

    communicationSessionStore.finalizeBusinessInsights(record.id);
    expect(communicationSessionStore.readBusinessInsights(record.id)).toHaveLength(count);
  });
});
