import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommunicationRecord, EvidenceObject } from '../../shared/communication/CommunicationTypes';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-communication-business-intelligence-pipeline-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmp },
}));

const callGemini = vi.fn();
vi.mock('./CommunicationTranscription', () => ({
  callGemini: (...args: unknown[]) => callGemini(...args),
}));

import { communicationSessionStore } from './CommunicationSessionStore';
import { generateBusinessInsightsForRecording, getBusinessInsightsForRecording } from './CommunicationBusinessIntelligencePipeline';

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

/** Seeds this recording with real, finalized Phase 3A evidence — the only prerequisite Phase 3B is allowed to depend on. */
function seedEvidence(recordId: string, items: EvidenceObject[]): void {
  for (const item of items) communicationSessionStore.appendEvidencePartial(recordId, { ...item, recordingId: recordId });
  communicationSessionStore.finalizeEvidence(recordId);
}

function geminiInsightsResponse(insights: unknown[]): { insights: unknown[] } {
  return { insights };
}

beforeEach(() => {
  communicationSessionStore.init();
  callGemini.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CommunicationBusinessIntelligencePipeline — generateBusinessInsightsForRecording', () => {
  it('rejects an unknown recording', async () => {
    const result = await generateBusinessInsightsForRecording({ communicationId: 'nope', apiKey: 'key' });
    expect(result.ok).toBe(false);
  });

  it('rejects a recording with no Phase 3A evidence yet — never re-derives evidence itself', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-no-evidence'));
    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('Evidence');
    expect(callGemini).not.toHaveBeenCalled();
  });

  it('rejects a missing apiKey once evidence exists, never calling the AI', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-no-key'));
    seedEvidence(record.id, [evidence()]);
    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: '' });
    expect(result.ok).toBe(false);
    expect(callGemini).not.toHaveBeenCalled();
  });

  it('produces immutable, evidenceId-citing Business Insights for AI-identified findings', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-basic'));
    seedEvidence(record.id, [
      evidence({ evidenceId: 'ev-1', speakerId: 'Speaker 1', transcript: 'We need this by Friday.', startTimestamp: 0, endTimestamp: 3 }),
      evidence({ evidenceId: 'ev-2', speakerId: 'Speaker 2', transcript: "Let's go with option B.", startTimestamp: 3, endTimestamp: 6 }),
    ]);
    callGemini.mockResolvedValue(
      geminiInsightsResponse([
        { kind: 'requirement', description: 'Needs delivery by Friday.', evidenceIds: ['ev-1'], confidence: 'high' },
        { kind: 'decision', description: 'Chose option B.', evidenceIds: ['ev-2'], confidence: 'medium' },
      ])
    );

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);

    const insights = getBusinessInsightsForRecording(record.id);
    const aiInsights = insights.filter((i) => i.kind !== 'coaching');
    expect(aiInsights).toHaveLength(2);
    for (const item of aiInsights) {
      expect(typeof item.insightId).toBe('string');
      expect(item.insightId.length).toBeGreaterThan(0);
      expect(item.recordingId).toBe(record.id);
      expect(item.evidenceIds.length).toBeGreaterThan(0);
    }
    expect(new Set(aiInsights.map((i) => i.insightId)).size).toBe(2);
  });

  it('rejects (drops) an insight that cites an evidenceId this recording does not actually have — never fabricated', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-fake-evidence-id'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-real' })]);
    callGemini.mockResolvedValue(
      geminiInsightsResponse([
        { kind: 'risk', description: 'A risk citing a real id.', evidenceIds: ['ev-real'], confidence: 'low' },
        { kind: 'risk', description: 'A risk citing a hallucinated id.', evidenceIds: ['ev-does-not-exist'], confidence: 'low' },
        { kind: 'risk', description: 'A risk citing a mix of real and fake ids.', evidenceIds: ['ev-real', 'ev-also-fake'], confidence: 'low' },
      ])
    );

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    expect(result.data?.insightCount).toBe(2); // 1 real risk + 1 coaching insight — both fabricated-id risks dropped

    const insights = getBusinessInsightsForRecording(record.id);
    const risks = insights.filter((i) => i.kind === 'risk');
    expect(risks).toHaveLength(1);
    expect(risks[0]?.description).toBe('A risk citing a real id.');
  });

  it('rejects an insight with an empty or missing evidenceIds array', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-empty-evidence-ids'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-real' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'risk', description: 'Unsupported claim.', evidenceIds: [], confidence: 'low' }]));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const insights = getBusinessInsightsForRecording(record.id).filter((i) => i.kind !== 'coaching');
    expect(insights).toHaveLength(0);
  });

  it('rejects an insight with an empty description', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-empty-description'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-real' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'risk', description: '   ', evidenceIds: ['ev-real'], confidence: 'low' }]));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const insights = getBusinessInsightsForRecording(record.id).filter((i) => i.kind !== 'coaching');
    expect(insights).toHaveLength(0);
  });

  it('the model can never produce a kind: "coaching" insight — that kind is reserved exclusively for the deterministic function', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-no-ai-coaching'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-real' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'coaching', description: 'A fake AI-authored coaching note.', evidenceIds: ['ev-real'], confidence: 'high' }]));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const coachingInsights = getBusinessInsightsForRecording(record.id).filter((i) => i.kind === 'coaching');
    expect(coachingInsights).toHaveLength(1); // only the real, deterministic one
    expect(coachingInsights[0]?.description).toContain('Talk/listen distribution');
    expect(coachingInsights[0]?.description).not.toContain('fake AI-authored');
  });

  it('falls back to confidence "low" for a missing or invalid confidence value', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-bad-confidence'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-real' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'risk', description: 'Real risk.', evidenceIds: ['ev-real'], confidence: 'extremely-sure' }]));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const risk = getBusinessInsightsForRecording(record.id).find((i) => i.kind === 'risk');
    expect(risk?.confidence).toBe('low');
  });

  it('participant is derived from the cited evidence\'s real speakerId — never trusted from the model\'s own output', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-derived-participant'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1', speakerId: 'Speaker 1' })]);
    callGemini.mockResolvedValue(
      geminiInsightsResponse([{ kind: 'decision', description: 'A decision.', evidenceIds: ['ev-1'], confidence: 'high', participant: 'Speaker 99' }])
    );

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const decision = getBusinessInsightsForRecording(record.id).find((i) => i.kind === 'decision');
    expect(decision?.participant).toBe('Speaker 1'); // real, derived — never the hallucinated 'Speaker 99'
  });

  it('participant is null when cited evidence spans more than one speaker', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-mixed-speaker-participant'));
    seedEvidence(record.id, [
      evidence({ evidenceId: 'ev-1', speakerId: 'Speaker 1' }),
      evidence({ evidenceId: 'ev-2', speakerId: 'Speaker 2' }),
    ]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'decision', description: 'A joint decision.', evidenceIds: ['ev-1', 'ev-2'], confidence: 'high' }]));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const decision = getBusinessInsightsForRecording(record.id).find((i) => i.kind === 'decision');
    expect(decision?.participant).toBeNull();
  });

  it('sentimentLabel is only kept for kind "sentiment" — discarded even if the model attaches one to a different kind', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-sentiment-scoping'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    callGemini.mockResolvedValue(
      geminiInsightsResponse([
        { kind: 'sentiment', description: 'Positive tone.', evidenceIds: ['ev-1'], confidence: 'medium', sentimentLabel: 'positive' },
        { kind: 'risk', description: 'A risk with a stray sentimentLabel.', evidenceIds: ['ev-1'], confidence: 'medium', sentimentLabel: 'negative' },
      ])
    );

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const insights = getBusinessInsightsForRecording(record.id);
    const sentiment = insights.find((i) => i.kind === 'sentiment');
    const risk = insights.find((i) => i.kind === 'risk');
    expect(sentiment?.sentimentLabel).toBe('positive');
    expect(risk?.sentimentLabel).toBeNull();
  });

  it('duplicate prevention: reprocessing an already-finalized recording never calls the AI again and returns the same insights', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-idempotent'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'decision', description: 'Once.', evidenceIds: ['ev-1'], confidence: 'high' }]));

    const first = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    const second = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });

    expect(callGemini).toHaveBeenCalledTimes(1);
    if (!first.ok || !second.ok) throw new Error('expected both calls to succeed');
    expect(first.data?.insightCount).toBe(second.data?.insightCount);
  });

  it('duplicate prevention: two concurrent calls for the same recording never both run', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-concurrent'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    let resolveCall: (value: unknown) => void = () => {};
    callGemini.mockReturnValue(new Promise((resolve) => { resolveCall = resolve; }));

    const firstCall = generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    const secondCall = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(secondCall.ok).toBe(false);

    resolveCall(geminiInsightsResponse([]));
    const firstResult = await firstCall;
    expect(firstResult.ok).toBe(true);
    expect(callGemini).toHaveBeenCalledTimes(1);
  });

  it('crash recovery: a stale partial insights file from an interrupted prior run is discarded, never resumed into or duplicated', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-crash-recovery'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    communicationSessionStore.appendBusinessInsightPartial(record.id, {
      insightId: 'stale-from-crashed-run',
      recordingId: record.id,
      kind: 'decision',
      description: 'Stale.',
      evidenceIds: ['ev-1'],
      participant: null,
      confidence: 'low',
      sentimentLabel: null,
      processingVersion: 'business-v1',
      createdAt: Date.now(),
    });
    expect(communicationSessionStore.hasPartialBusinessInsights(record.id)).toBe(true);

    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'decision', description: 'Fresh run.', evidenceIds: ['ev-1'], confidence: 'high' }]));
    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);

    const insights = getBusinessInsightsForRecording(record.id).filter((i) => i.kind === 'decision');
    expect(insights).toHaveLength(1);
    expect(insights[0]?.insightId).not.toBe('stale-from-crashed-run');
    expect(insights[0]?.description).toBe('Fresh run.');
    expect(communicationSessionStore.hasPartialBusinessInsights(record.id)).toBe(false);
  });

  it('a genuine AI-call failure returns an honest { ok: false } rather than rejecting, and leaves no stale partial file', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-ai-failure'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    callGemini.mockRejectedValue(new Error('Gemini request failed (500): server error'));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.message).toContain('server error');
    expect(communicationSessionStore.hasPartialBusinessInsights(record.id)).toBe(false);
    expect(communicationSessionStore.hasBusinessInsights(record.id)).toBe(false);

    callGemini.mockResolvedValue(geminiInsightsResponse([]));
    const retry = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    expect(retry.ok).toBe(true);
  });

  describe('deterministic coaching (talk/listen distribution)', () => {
    it('computes a real, deterministic talk/listen breakdown from evidence durations — never an LLM call for this part', async () => {
      const record = communicationSessionStore.create(makeRecord('bi-coaching-basic'));
      seedEvidence(record.id, [
        evidence({ evidenceId: 'ev-1', speakerId: 'Speaker 1', startTimestamp: 0, endTimestamp: 6 }), // 6s
        evidence({ evidenceId: 'ev-2', speakerId: 'Speaker 2', startTimestamp: 6, endTimestamp: 10 }), // 4s
      ]);
      callGemini.mockResolvedValue(geminiInsightsResponse([]));

      const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
      if (!result.ok) throw new Error(result.message);

      const coaching = getBusinessInsightsForRecording(record.id).find((i) => i.kind === 'coaching');
      expect(coaching).toBeDefined();
      expect(coaching?.confidence).toBe('high'); // a deterministic arithmetic fact, not an inference
      expect(coaching?.participant).toBeNull();
      expect(coaching?.evidenceIds.sort()).toEqual(['ev-1', 'ev-2']);
      expect(coaching?.description).toContain('Speaker 1: 6.0s (60%)');
      expect(coaching?.description).toContain('Speaker 2: 4.0s (40%)');
    });

    it('reports no coaching insight when there is zero real speaking duration to report', async () => {
      const record = communicationSessionStore.create(makeRecord('bi-coaching-zero-duration'));
      seedEvidence(record.id, [evidence({ evidenceId: 'ev-1', startTimestamp: 5, endTimestamp: 5 })]);
      callGemini.mockResolvedValue(geminiInsightsResponse([]));

      const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
      if (!result.ok) throw new Error(result.message);
      expect(getBusinessInsightsForRecording(record.id).filter((i) => i.kind === 'coaching')).toHaveLength(0);
    });

    it('never calls the AI when the recording has zero evidence objects (an honestly-empty Phase 3A result), producing zero insights of any kind', async () => {
      const record = communicationSessionStore.create(makeRecord('bi-no-evidence-objects'));
      seedEvidence(record.id, []); // finalizes an honestly-empty evidence.jsonl
      const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
      if (!result.ok) throw new Error(result.message);
      expect(result.data?.insightCount).toBe(0);
      expect(callGemini).not.toHaveBeenCalled();
    });
  });

  it('deterministic ordering: getBusinessInsightsForRecording sorts by the earliest startTimestamp among each insight\'s cited evidence', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-order'));
    seedEvidence(record.id, [
      evidence({ evidenceId: 'ev-early', startTimestamp: 0, endTimestamp: 2 }),
      evidence({ evidenceId: 'ev-late', startTimestamp: 10, endTimestamp: 12 }),
    ]);
    callGemini.mockResolvedValue(
      geminiInsightsResponse([
        { kind: 'decision', description: 'Late finding, listed first by the model.', evidenceIds: ['ev-late'], confidence: 'high' },
        { kind: 'risk', description: 'Early finding, listed second by the model.', evidenceIds: ['ev-early'], confidence: 'high' },
      ])
    );

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const nonCoaching = getBusinessInsightsForRecording(record.id).filter((i) => i.kind !== 'coaching');
    expect(nonCoaching.map((i) => i.description)).toEqual(['Early finding, listed second by the model.', 'Late finding, listed first by the model.']);
  });

  it('mutating an object returned by getBusinessInsightsForRecording never affects a subsequent read', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-immutable-read'));
    seedEvidence(record.id, [evidence({ evidenceId: 'ev-1' })]);
    callGemini.mockResolvedValue(geminiInsightsResponse([{ kind: 'decision', description: 'Original.', evidenceIds: ['ev-1'], confidence: 'high' }]));
    await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });

    const insights = getBusinessInsightsForRecording(record.id);
    const decision = insights.find((i) => i.kind === 'decision')!;
    (decision as unknown as Record<string, unknown>).description = 'TAMPERED';

    const reread = getBusinessInsightsForRecording(record.id).find((i) => i.kind === 'decision');
    expect(reread?.description).toBe('Original.');
  });

  it('long recordings / incremental processing: many AI-returned insights are all captured correctly with no duplicate insightIds', async () => {
    const record = communicationSessionStore.create(makeRecord('bi-long-run'));
    const evidenceItems = Array.from({ length: 50 }, (_, i) => evidence({ evidenceId: `ev-${i}`, startTimestamp: i * 2, endTimestamp: i * 2 + 1 }));
    seedEvidence(record.id, evidenceItems);
    const rawInsights = Array.from({ length: 200 }, (_, i) => ({
      kind: 'risk' as const,
      description: `Risk number ${i}.`,
      evidenceIds: [`ev-${i % 50}`],
      confidence: 'low' as const,
    }));
    callGemini.mockResolvedValue(geminiInsightsResponse(rawInsights));

    const result = await generateBusinessInsightsForRecording({ communicationId: record.id, apiKey: 'key' });
    if (!result.ok) throw new Error(result.message);
    const risks = getBusinessInsightsForRecording(record.id).filter((i) => i.kind === 'risk');
    expect(risks).toHaveLength(200);
    expect(new Set(risks.map((i) => i.insightId)).size).toBe(200);
  });
});
