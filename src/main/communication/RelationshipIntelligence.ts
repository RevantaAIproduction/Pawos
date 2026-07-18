/**
 * Relationship Intelligence (Communication Intelligence Runtime, Phase 1) —
 * real synthesis over a person's or company's actual linked communications,
 * same fetch + responseSchema discipline as CommunicationTranscription.ts.
 * Deliberately separate from per-communication extraction (which already
 * runs once per session): this only runs when a NEW communication gets
 * linked to an existing participant/company, synthesizing across everything
 * linked so far — never guessed from a name/role/domain alone, and every
 * claim traces back to a real communicationId.
 */

const DEFAULT_MODEL = 'gemini-flash-latest';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type RelationshipCommunicationInput = {
  id: string;
  startedAt: number;
  headline: string;
  summary: string;
  keyPoints: string[];
};

export type RelationshipSynthesisResult = {
  frequentTopics: { topic: string; evidenceCommunicationIds: string[] }[];
  /** Only ever populated once there are 2+ real communications to compare — a single conversation can't evidence a "style". */
  communicationStyle: string | null;
  interests: { description: string; evidenceCommunicationId: string }[];
};

async function callGemini(params: { apiKey: string; prompt: string; responseSchema: unknown; model?: string; baseUrl?: string }): Promise<any> {
  const { apiKey, prompt, responseSchema, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL } = params;
  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema },
    }),
  });
  if (!res.ok) throw new Error(`Relationship intelligence request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as any;
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Relationship intelligence returned an unexpected response.');
  }
}

/** Real synthesis over every real communication linked to one person/company so far — genuinely recurring topics only (never a topic seen in just one conversation reported as "frequent"), a communication-style observation only once 2+ real communications exist, and interests each tied to the one real communication they came from. */
export async function synthesizeRelationshipIntelligence(params: {
  apiKey: string;
  entityName: string;
  communications: RelationshipCommunicationInput[];
  model?: string;
  baseUrl?: string;
}): Promise<RelationshipSynthesisResult> {
  if (params.communications.length === 0) {
    return { frequentTopics: [], communicationStyle: null, interests: [] };
  }

  const communicationsBlock = params.communications
    .map((c) => `[id: ${c.id}] (${new Date(c.startedAt).toISOString()}) ${c.headline}\nSummary: ${c.summary}\nKey points: ${c.keyPoints.join('; ')}`)
    .join('\n\n');

  const prompt = `You are analyzing the real communication history with "${params.entityName}" across ${params.communications.length} real, separate conversation(s) to find genuine patterns. Never invent a pattern that isn't actually evidenced by at least one real conversation below.

${communicationsBlock}

Identify:
- frequentTopics: topics that genuinely came up in MORE THAN ONE of the conversations above (never a topic from just a single conversation) — for each, list the real [id]s of every conversation where it came up.
- communicationStyle: one short, concrete observation about how this person/organization communicates, grounded in real patterns across the conversations — ONLY if there are at least 2 conversations to compare; otherwise return an empty string.
- interests: real priorities or interests this person/organization has actually stated, each tied to the exact real [id] of the one conversation it came from.

If there is genuinely nothing to report for a category, return an empty array/string — never fabricate to fill a category.`;

  const parsed = await callGemini({
    apiKey: params.apiKey,
    model: params.model,
    baseUrl: params.baseUrl,
    prompt,
    responseSchema: {
      type: 'object',
      properties: {
        frequentTopics: {
          type: 'array',
          items: { type: 'object', properties: { topic: { type: 'string' }, communicationIds: { type: 'array', items: { type: 'string' } } }, required: ['topic', 'communicationIds'] },
        },
        communicationStyle: { type: 'string' },
        interests: {
          type: 'array',
          items: { type: 'object', properties: { description: { type: 'string' }, communicationId: { type: 'string' } }, required: ['description', 'communicationId'] },
        },
      },
      required: ['frequentTopics', 'communicationStyle', 'interests'],
    },
  });

  const validIds = new Set(params.communications.map((c) => c.id));
  const frequentTopics = Array.isArray(parsed.frequentTopics)
    ? parsed.frequentTopics
        .map((t: any) => ({ topic: String(t.topic ?? ''), evidenceCommunicationIds: (Array.isArray(t.communicationIds) ? t.communicationIds : []).map(String).filter((id: string) => validIds.has(id)) }))
        .filter((t: { topic: string; evidenceCommunicationIds: string[] }) => t.topic && t.evidenceCommunicationIds.length >= 2)
    : [];

  const interests = Array.isArray(parsed.interests)
    ? parsed.interests
        .map((i: any) => ({ description: String(i.description ?? ''), evidenceCommunicationId: String(i.communicationId ?? '') }))
        .filter((i: { description: string; evidenceCommunicationId: string }) => i.description && validIds.has(i.evidenceCommunicationId))
    : [];

  return {
    frequentTopics,
    communicationStyle: params.communications.length >= 2 && typeof parsed.communicationStyle === 'string' && parsed.communicationStyle.trim() ? parsed.communicationStyle.trim() : null,
    interests,
  };
}

const ACTIVE_WITHIN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const COOLING_WITHIN_MS = 45 * 24 * 60 * 60 * 1000; // 45 days

/** Deterministic, date-math-only relationship health — never a sentiment guess, purely "how long since the last real communication". */
export function computeRelationshipHealth(communicationStartTimes: number[]): { status: 'new' | 'active' | 'cooling' | 'dormant'; lastInteractionAt: number | null; reasoning: string } {
  if (communicationStartTimes.length === 0) {
    return { status: 'new', lastInteractionAt: null, reasoning: 'No communications recorded yet.' };
  }
  const lastInteractionAt = Math.max(...communicationStartTimes);
  const daysSince = Math.floor((Date.now() - lastInteractionAt) / (24 * 60 * 60 * 1000));
  if (communicationStartTimes.length === 1) {
    return { status: 'new', lastInteractionAt, reasoning: `Only one communication so far, ${daysSince} day(s) ago.` };
  }
  const sinceMs = Date.now() - lastInteractionAt;
  if (sinceMs <= ACTIVE_WITHIN_MS) return { status: 'active', lastInteractionAt, reasoning: `Last real communication was ${daysSince} day(s) ago, across ${communicationStartTimes.length} total communications.` };
  if (sinceMs <= COOLING_WITHIN_MS) return { status: 'cooling', lastInteractionAt, reasoning: `Last real communication was ${daysSince} day(s) ago — no contact in the last two weeks.` };
  return { status: 'dormant', lastInteractionAt, reasoning: `Last real communication was ${daysSince} day(s) ago — no contact in over 45 days.` };
}
