import { v4 as uuidv4 } from 'uuid';
import { communicationSessionStore } from './CommunicationSessionStore';
import { getEvidenceForRecording } from './CommunicationEvidencePipeline';
import { callGemini } from './CommunicationTranscription';
import type {
  AdapterResult,
  BusinessInsight,
  BusinessInsightConfidence,
  BusinessInsightKind,
  EvidenceObject,
  EvidenceSpeakerId,
  SentimentLabel,
} from '../../shared/communication/CommunicationTypes';

/**
 * Business Intelligence (Communication Intelligence Runtime, Phase 3B) — interprets
 * Phase 3A's already-finalized Evidence Objects into decisions, requirements, risks,
 * buying signals, objections, opportunities, sentiment, and coaching. This pipeline
 * NEVER calls transcribeCommunicationAudio() and never re-derives transcript/speaker/
 * timestamp facts on its own — it consumes only what Phase 3A already produced and
 * finalized, exactly as instructed ("Phase 3B is not permitted to re-derive transcript/
 * speaker/timestamp facts on its own; it interprets what Phase 3A already established
 * as fact"). Every produced BusinessInsight cites the real evidenceId(s) it is based
 * on; any AI-proposed finding whose cited evidenceId(s) cannot be verified against
 * this recording's own real Evidence Objects is dropped outright, never persisted
 * with a fabricated or unverifiable reference.
 */

const PROCESSING_VERSION = 'business-v1';

/** The kinds the AI-analysis call is allowed to produce — 'coaching' is deliberately excluded here, since it is computed entirely deterministically (see computeTalkListenCoaching) and never requested from the model. */
const AI_INSIGHT_KINDS = new Set<BusinessInsightKind>(['decision', 'requirement', 'risk', 'buyingSignal', 'objection', 'opportunity', 'sentiment']);
const VALID_CONFIDENCE = new Set<BusinessInsightConfidence>(['low', 'medium', 'high']);
const VALID_SENTIMENT = new Set<SentimentLabel>(['positive', 'negative', 'neutral', 'mixed']);

type RawInsight = {
  kind?: unknown;
  description?: unknown;
  evidenceIds?: unknown;
  confidence?: unknown;
  sentimentLabel?: unknown;
};

/**
 * Verifies every id in a model-proposed insight's evidenceIds actually exists in this
 * recording's own real Evidence Objects. Returns null (reject the whole insight) if the
 * array is empty/malformed or cites even one id this recording doesn't have — "never
 * invent a signal you can't point to real evidence for," now enforced as a real,
 * checkable identifier rather than a quoted-text heuristic.
 */
function resolveValidEvidenceIds(raw: unknown, knownIds: Set<string>): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw.map(String);
  return ids.every((id) => knownIds.has(id)) ? ids : null;
}

/**
 * The participant an insight concerns is always DERIVED from the real speakerId(s) of
 * its cited evidence — never trusted from the model's own output — so a hallucinated
 * participant can never reach a persisted BusinessInsight. Returns null when the cited
 * evidence spans more than one speaker (an insight that isn't cleanly attributable to
 * one participant), never a guessed single speaker.
 */
function deriveParticipant(evidenceIds: string[], evidenceById: Map<string, EvidenceObject>): EvidenceSpeakerId | null {
  const speakers = new Set<string>();
  for (const id of evidenceIds) {
    const evidence = evidenceById.get(id);
    if (evidence) speakers.add(evidence.speakerId);
  }
  return speakers.size === 1 ? [...speakers][0]! : null;
}

/**
 * Coaching (talk/listen distribution) — deliberately deterministic and rule-based, never
 * an LLM call, matching this session's own established recommendation for coaching-style
 * output ("a rule-based pass over already-extracted structured data, not a new LLM call").
 * Computed purely from real Phase 3A evidence durations (endTimestamp - startTimestamp)
 * grouped by speakerId — an arithmetic fact, not an inference, hence the maximal 'high'
 * confidence. Cites every evidence id the recording has, since the statistic is derived
 * from all of them. Returns null for a recording with zero evidence or zero total
 * speaking duration — an honest "nothing to report," never a fabricated distribution.
 */
function computeTalkListenCoaching(evidence: EvidenceObject[], communicationId: string): BusinessInsight | null {
  if (evidence.length === 0) return null;
  const totalsBySpeaker = new Map<string, number>();
  let totalDuration = 0;
  for (const item of evidence) {
    const duration = Math.max(0, item.endTimestamp - item.startTimestamp);
    totalsBySpeaker.set(item.speakerId, (totalsBySpeaker.get(item.speakerId) ?? 0) + duration);
    totalDuration += duration;
  }
  if (totalDuration <= 0) return null;

  const breakdown = [...totalsBySpeaker.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([speaker, seconds]) => `${speaker}: ${seconds.toFixed(1)}s (${((seconds / totalDuration) * 100).toFixed(0)}%)`)
    .join(', ');

  return {
    insightId: uuidv4(),
    recordingId: communicationId,
    kind: 'coaching',
    description: `Talk/listen distribution — ${breakdown}.`,
    evidenceIds: evidence.map((item) => item.evidenceId),
    participant: null,
    confidence: 'high',
    sentimentLabel: null,
    processingVersion: PROCESSING_VERSION,
    createdAt: Date.now(),
  };
}

/** The one real Gemini call this pipeline makes — reuses callGemini() (exported from CommunicationTranscription.ts specifically so this pipeline could reuse it rather than duplicating the fetch/schema mechanism). Every line of input is a real evidence entry, explicitly labeled with its real evidenceId, so the model always has a real id to cite. */
async function requestBusinessInsights(params: { apiKey: string; evidence: EvidenceObject[]; model?: string; baseUrl?: string }): Promise<RawInsight[]> {
  const evidenceText = params.evidence
    .map((item) => `[${item.evidenceId}][${item.speakerId}][${item.startTimestamp}s-${item.endTimestamp}s] ${item.transcript}`)
    .join('\n');

  const prompt = `The following is a real, evidence-indexed transcript of a conversation. Each line is tagged with its real evidenceId in square brackets, then the speaker label, then the real time range, then the actual spoken text.

Identify real business-relevant findings: decisions actually made, requirements or needs actually stated, risks or concerns actually raised, buying signals, objections, coherent business opportunities (a synthesis of related buying signals into one finding), and the emotional sentiment of distinct segments. For every finding, cite the EXACT evidenceId(s) (copied verbatim from the brackets above) that support it — never invent an evidenceId, never cite one that is not in the list below. If you cannot point to a real evidenceId for a finding, do not report it at all. Return an empty array for any category with nothing genuinely present — never force a finding that isn't really there.

Evidence:
${evidenceText.slice(0, 20000)}`;

  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    parts: [{ text: prompt }],
    responseSchema: {
      type: 'object',
      properties: {
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['decision', 'requirement', 'risk', 'buyingSignal', 'objection', 'opportunity', 'sentiment'] },
              description: { type: 'string' },
              evidenceIds: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              sentimentLabel: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
            },
            required: ['kind', 'description', 'evidenceIds', 'confidence'],
          },
        },
      },
      required: ['insights'],
    },
  });

  return Array.isArray(parsed.insights) ? parsed.insights : [];
}

/** In-memory, per-process guard against two concurrent generation runs for the same recording within one process lifetime — identical rationale to CommunicationEvidencePipeline's own currentlyGenerating guard. */
const currentlyGenerating = new Set<string>();

/**
 * Generates Business Insights for one recording's already-finalized Evidence Objects —
 * the entry point for Business Intelligence. Deliberately a standalone, explicitly-invoked
 * function, never called from any recording/timeline/evidence lifecycle method. Requires
 * Phase 3A evidence to already exist (rejects otherwise, rather than silently triggering
 * evidence generation itself — that would blur the "Phase 3B never re-derives Phase 3A
 * facts" boundary). Idempotent, crash-safe, and apiKey-validated, mirroring
 * generateEvidenceForRecording()'s own exact discipline.
 */
export async function generateBusinessInsightsForRecording(params: {
  communicationId: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}): Promise<AdapterResult<{ insightCount: number }>> {
  const { communicationId, apiKey } = params;
  const record = communicationSessionStore.get(communicationId);
  if (!record) return { ok: false, message: 'Communication not found.' };

  if (!communicationSessionStore.hasEvidence(communicationId)) {
    return { ok: false, message: 'Evidence must be generated for this recording (Phase 3A) before business intelligence can run.' };
  }

  if (communicationSessionStore.hasBusinessInsights(communicationId)) {
    return { ok: true, data: { insightCount: communicationSessionStore.readBusinessInsights(communicationId).length } };
  }
  if (currentlyGenerating.has(communicationId)) {
    return { ok: false, message: 'Business intelligence generation is already in progress for this recording.' };
  }
  if (!apiKey) return { ok: false, message: 'No Gemini API key configured.' };

  currentlyGenerating.add(communicationId);
  try {
    communicationSessionStore.discardPartialBusinessInsights(communicationId);

    const evidence = getEvidenceForRecording(communicationId);
    const knownIds = new Set(evidence.map((item) => item.evidenceId));
    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));

    let insightCount = 0;

    const coaching = computeTalkListenCoaching(evidence, communicationId);
    if (coaching) {
      communicationSessionStore.appendBusinessInsightPartial(communicationId, coaching);
      insightCount++;
    }

    if (evidence.length > 0) {
      const raw = await requestBusinessInsights({ apiKey, evidence, model: params.model, baseUrl: params.baseUrl });
      for (const item of raw) {
        const validEvidenceIds = resolveValidEvidenceIds(item.evidenceIds, knownIds);
        if (!validEvidenceIds) continue; // rejected: cites at least one evidenceId this recording doesn't actually have, or none at all

        const kind = typeof item.kind === 'string' && AI_INSIGHT_KINDS.has(item.kind as BusinessInsightKind) ? (item.kind as BusinessInsightKind) : null;
        if (!kind) continue; // rejected: not a real, AI-eligible kind (also blocks a model ever claiming kind: 'coaching')

        const description = typeof item.description === 'string' ? item.description.trim() : '';
        if (!description) continue; // rejected: never persist an insight with no real description

        const confidence: BusinessInsightConfidence = VALID_CONFIDENCE.has(item.confidence as BusinessInsightConfidence)
          ? (item.confidence as BusinessInsightConfidence)
          : 'low';

        const insight: BusinessInsight = {
          insightId: uuidv4(),
          recordingId: communicationId,
          kind,
          description,
          evidenceIds: validEvidenceIds,
          participant: deriveParticipant(validEvidenceIds, evidenceById),
          confidence,
          sentimentLabel: kind === 'sentiment' && VALID_SENTIMENT.has(item.sentimentLabel as SentimentLabel) ? (item.sentimentLabel as SentimentLabel) : null,
          processingVersion: PROCESSING_VERSION,
          createdAt: Date.now(),
        };
        communicationSessionStore.appendBusinessInsightPartial(communicationId, insight);
        insightCount++;
      }
    }

    communicationSessionStore.finalizeBusinessInsights(communicationId);
    return { ok: true, data: { insightCount } };
  } catch (error) {
    communicationSessionStore.discardPartialBusinessInsights(communicationId);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Business intelligence generation failed: ${message}` };
  } finally {
    currentlyGenerating.delete(communicationId);
  }
}

/**
 * Read-only accessor — returns every finalized Business Insight for a recording, sorted by
 * the earliest startTimestamp among each insight's own cited evidence (a real, content-
 * position-based order, mirroring getEvidenceForRecording()'s own read-time-sort
 * discipline) — never raw write order.
 */
export function getBusinessInsightsForRecording(communicationId: string): BusinessInsight[] {
  const insights = communicationSessionStore.readBusinessInsights(communicationId);
  const evidenceById = new Map(getEvidenceForRecording(communicationId).map((item) => [item.evidenceId, item]));

  const earliestTimestamp = (insight: BusinessInsight): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const id of insight.evidenceIds) {
      const evidence = evidenceById.get(id);
      if (evidence && evidence.startTimestamp < min) min = evidence.startTimestamp;
    }
    return Number.isFinite(min) ? min : 0;
  };

  return [...insights].sort((a, b) => earliestTimestamp(a) - earliestTimestamp(b));
}
