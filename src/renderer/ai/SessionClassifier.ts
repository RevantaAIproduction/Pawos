export type SessionContinuationCandidate = {
  id: string;
  title: string;
  lastMessage: string;
};

export type SessionContinuationDecision = {
  action: 'continue' | 'new';
  sessionId: string | null;
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
}): Promise<SessionContinuationDecision> {
  const {
    apiKey,
    transcript,
    candidates,
    model = 'gemini-flash-latest',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  } = params;

  if (candidates.length === 0) return { action: 'new', sessionId: null };

  const candidateList = candidates
    .map((c) => `id="${c.id}" title="${c.title}" last_message="${c.lastMessage}"`)
    .join('\n');
  const prompt = `A user just said: "${transcript}"\n\nTheir recent conversation sessions:\n${candidateList}\n\nDecide: does this message continue one of these existing sessions (e.g. it directly references one — "continue yesterday's X", "back to the Y" — or is clearly the same topic), or does it start a brand new conversation? If continuing, name the matching session's id exactly as given above.`;

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

  if (!res.ok) return { action: 'new', sessionId: null };

  const json = await res.json();
  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';

  let parsed: { action?: string; sessionId?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    return { action: 'new', sessionId: null };
  }

  // Only trust a 'continue' decision if it names a session we actually
  // offered — never file a turn under an id the model hallucinated.
  if (parsed.action === 'continue' && parsed.sessionId && candidates.some((c) => c.id === parsed.sessionId)) {
    return { action: 'continue', sessionId: parsed.sessionId };
  }
  return { action: 'new', sessionId: null };
}
