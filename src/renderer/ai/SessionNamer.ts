import { v4 as uuidv4 } from 'uuid';
import type { SessionClassifierUsage } from './SessionClassifier';

/** Tidies a model-written title: no quotes, no trailing punctuation, sentence-sized. Null if nothing usable is left. */
export function cleanSessionName(raw: string): string | null {
  const name = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/[.!?:;,\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return null;
  return name.length > 60 ? `${name.slice(0, 59).trimEnd()}…` : name;
}

/**
 * Names a new session after its first exchange — a short topic like "PawOS build warnings" or
 * "Resume for frontend role", shown in the chat list and the header. Small separate task on the
 * cheapest model; returns null (the session keeps its first-message title) if anything fails.
 */
export async function nameSession(params: {
  apiKey: string;
  transcript: string;
  reply: string;
  model?: string;
  baseUrl?: string;
}): Promise<{ name: string | null; usage: SessionClassifierUsage | null }> {
  const { apiKey, transcript, reply, model = 'gemini-3.5-flash-lite', baseUrl = 'https://generativelanguage.googleapis.com/v1beta' } = params;
  const prompt = `Name this conversation for a chat list, like "PawOS build warnings", "OAuth parity web/desktop" or "Resume for frontend role": 2 to 6 words, sentence case, the topic only — no quotes, no ending punctuation, never "Conversation about".\n\nUser: ${transcript.slice(0, 1500)}\n\nAssistant: ${reply.slice(0, 1500)}`;
  const requestId = uuidv4();
  try {
    const res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        },
      }),
    });
    if (!res.ok) return { name: null, usage: null };
    const json = await res.json();
    const u = json.usageMetadata;
    const usage: SessionClassifierUsage | null = u
      ? {
          provider: 'gemini',
          model,
          inputTokens: typeof u.promptTokenCount === 'number' ? u.promptTokenCount : null,
          outputTokens: typeof u.candidatesTokenCount === 'number' ? u.candidatesTokenCount : null,
          cachedInputTokens: typeof u.cachedContentTokenCount === 'number' ? u.cachedContentTokenCount : null,
          totalTokens: typeof u.totalTokenCount === 'number' ? u.totalTokenCount : null,
          thoughtsTokens: typeof u.thoughtsTokenCount === 'number' ? u.thoughtsTokenCount : null,
          requestId,
        }
      : null;
    let title = '';
    try {
      title = String(JSON.parse(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}').title ?? '');
    } catch {
      title = '';
    }
    return { name: cleanSessionName(title), usage };
  } catch {
    return { name: null, usage: null };
  }
}
