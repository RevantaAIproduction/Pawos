import { v4 as uuidv4 } from 'uuid';

export type SessionContinuationCandidate = {
  id: string;
  title: string;
  lastMessage: string;
};

export type SessionContinuationDecision = {
  action: 'continue' | 'new';
  sessionId: string | null;
};

/** Minimal, locally-defined mirror of shared/billing/UsageMeteringTypes.ProviderUsageMetadata —
 *  duplicated (not imported) so this renderer file never depends on a main-process-adjacent module;
 *  the caller (useConversationController.ts) reports this to the main process via
 *  ipc.billingReportUsageEvent(), which is the only place it's turned into a durable ledger entry. */
export type SessionClassifierUsage = {
  provider: 'gemini';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  thoughtsTokens: number | null;
  requestId: string | null;
};

/**
 * Decides whether a new message continues one of the user's recent
 * conversation sessions or starts a fresh one — the "Automatic Session
 * Detection" behavior: "Continue yesterday's React lesson" resumes that
 * session, "Let's talk about my startup" starts a new one. Uses Gemini's
 * structured JSON output (same pattern as GeminiVision.ts) regardless of
 * which provider is active for chat, since this is a small, separate
 * classification task, not the visible conversation itself.
 */
export async function classifySessionContinuation(params: {
  apiKey: string;
  transcript: string;
  candidates: SessionContinuationCandidate[];
  model?: string;
  baseUrl?: string;
}): Promise<{ decision: SessionContinuationDecision; usage: SessionClassifierUsage | null }> {
  const {
    apiKey,
    transcript,
    candidates,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  if (candidates.length === 0) return { decision: { action: 'new', sessionId: null }, usage: null };

  const candidateList = candidates
    .map((c) => `id="${c.id}" title="${c.title}" last_message="${c.lastMessage}"`)
    .join('\n');
  const prompt = `A user just said: "${transcript}"\n\nTheir recent conversation sessions:\n${candidateList}\n\nDecide: does this message continue one of these existing sessions (e.g. it directly references one — "continue yesterday's X", "back to the Y" — or is clearly the same topic), or does it start a brand new conversation? If continuing, name the matching session's id exactly as given above.`;

  // Minted once, right here, for this one real outgoing request — PawOS's own per-request identity
  // (Gemini's response body carries no stable id of its own). Makes the usage-ledger write idempotent.
  const requestId = uuidv4();
  const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['continue', 'new'] },
            sessionId: { type: 'string' },
          },
          required: ['action'],
        },
      },
    }),
  });

  if (!res.ok) return { decision: { action: 'new', sessionId: null }, usage: null };

  const json = await res.json();
  const usageMetadata = json.usageMetadata;
  const usage: SessionClassifierUsage | null = usageMetadata
    ? {
        provider: 'gemini',
        model,
        inputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null,
        outputTokens: typeof usageMetadata.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : null,
        cachedInputTokens: typeof usageMetadata.cachedContentTokenCount === 'number' ? usageMetadata.cachedContentTokenCount : null,
        totalTokens: typeof usageMetadata.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : null,
        thoughtsTokens: typeof usageMetadata.thoughtsTokenCount === 'number' ? usageMetadata.thoughtsTokenCount : null,
        requestId,
      }
    : null;

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { action?: string; sessionId?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { decision: { action: 'new', sessionId: null }, usage };
  }

  // Only trust a 'continue' decision if it names a session we actually
  // offered — never file a turn under an id the model hallucinated.
  if (parsed.action === 'continue' && parsed.sessionId && candidates.some((c) => c.id === parsed.sessionId)) {
    return { decision: { action: 'continue', sessionId: parsed.sessionId }, usage };
  }
  return { decision: { action: 'new', sessionId: null }, usage };
}
