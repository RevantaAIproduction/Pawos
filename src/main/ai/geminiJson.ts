import { v4 as uuidv4 } from 'uuid';
import { getGeminiApiKey } from './geminiApiKey';
import { recordUsageEvent, reportRequestEnd, reportRequestStart } from '../billing/UsageMeteringEngine';
import { finishMainProcessGeminiCall, reserveMainProcessGeminiCall } from '../billing/MeteredGeminiCall';
import type { NormalizedUsageRecord, UsageRequestType } from '../../shared/billing/UsageMeteringTypes';

/** JSON Schema subset accepted by Gemini's responseSchema. */
export type GeminiJsonSchema = {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, GeminiJsonSchema>;
  items?: GeminiJsonSchema;
  enum?: string[];
  required?: string[];
  description?: string;
};

export type GeminiJsonResult<T> =
  | { ok: true; data: T; usageRecord: NormalizedUsageRecord | null }
  | { ok: false; reason: string; usageRecord: NormalizedUsageRecord | null };

/**
 * Main-process sibling of src/renderer/ai/SessionClassifier.ts's proven
 * generateContent + responseSchema JSON-mode call. Duplicated here (rather
 * than IPC'd to the renderer) because file plugins execute entirely in
 * main and classification is a pure network call with no UI coupling.
 *
 * `requestType` decides how the call is billed: 'backgroundTask' (the default — PawOS-initiated
 * work such as file classification, excluded from rolling capacity) or 'conversationTurn' for a
 * request the user explicitly asked for (e.g. the career tools), which counts toward the effective
 * tier's Paw Compute and active-time limits exactly like a chat turn. Active time is the real
 * request duration, measured by reportRequestStart/End around the HTTP call.
 */
export async function generateJsonDetailed<T>(params: {
  prompt: string;
  schema: GeminiJsonSchema;
  model?: string;
  baseUrl?: string;
  requestType?: UsageRequestType;
  sessionId?: string | null;
}): Promise<GeminiJsonResult<T>> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, reason: 'The AI service is not configured on this device.', usageRecord: null };

  const {
    prompt,
    schema,
    model = 'gemini-3.6-flash',
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
    requestType = 'backgroundTask',
    sessionId = null,
  } = params;

  // Minted once, right here, for this one real outgoing request — PawOS's own per-request identity
  // (Gemini's response body carries no stable id of its own; see UsageMeteringTypes.ts's doc comment
  // on ProviderUsageMetadata.requestId). Used to make the usage-ledger write idempotent and to key
  // the active-time measurement.
  const requestId = uuidv4();
  const body: { contents: unknown; generationConfig: Record<string, unknown> } = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  };
  // Paid usage is reserved on the server before the call (sets the granted maxOutputTokens).
  const reservation = await reserveMainProcessGeminiCall({
    baseUrl, model, apiKey, body, requestKey: requestId,
    category: requestType === 'backgroundTask' ? 'background' : 'chat',
  });
  if (!reservation.ok) return { ok: false, reason: reservation.message, usageRecord: null };

  reportRequestStart(requestId);
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    reportRequestEnd(requestId);
    finishMainProcessGeminiCall(reservation.reservationId, requestId, null);
    return { ok: false, reason: `Could not reach the AI service: ${err instanceof Error ? err.message : String(err)}`, usageRecord: null };
  }

  let json: {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
      cachedContentTokenCount?: number;
      thoughtsTokenCount?: number;
    };
    error?: { message?: string };
  };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    reportRequestEnd(requestId);
    // The response body is unreadable, so Gemini's usage is unknown: leave the reservation for the
    // server to close at its full (worst-case) amount rather than releasing it as free.
    if (!res.ok) finishMainProcessGeminiCall(reservation.reservationId, requestId, null);
    return { ok: false, reason: `The AI service returned an unreadable response (HTTP ${res.status}).`, usageRecord: null };
  }
  reportRequestEnd(requestId);
  // Settle with the reported usage; release only a rejected call that reported none. A successful
  // response without usage is left for the server to close at the full reservation.
  if (json.usageMetadata) finishMainProcessGeminiCall(reservation.reservationId, requestId, json.usageMetadata);
  else if (!res.ok) finishMainProcessGeminiCall(reservation.reservationId, requestId, null);

  // Real Gemini usage metadata — covers every caller of this shared helper. Recorded even when the
  // response turns out to be unusable, because the provider still billed the tokens.
  let usageRecord: NormalizedUsageRecord | null = null;
  const usageMetadata = json.usageMetadata;
  if (usageMetadata) {
    usageRecord = recordUsageEvent(
      {
        provider: 'gemini',
        model,
        inputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null,
        outputTokens: typeof usageMetadata.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : null,
        cachedInputTokens: typeof usageMetadata.cachedContentTokenCount === 'number' ? usageMetadata.cachedContentTokenCount : null,
        totalTokens: typeof usageMetadata.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : null,
        thoughtsTokens: typeof usageMetadata.thoughtsTokenCount === 'number' ? usageMetadata.thoughtsTokenCount : null,
        requestId,
      },
      requestType,
      { sessionId, runId: null }
    );
  }

  if (!res.ok) {
    return { ok: false, reason: `The AI service rejected the request (HTTP ${res.status})${json.error?.message ? `: ${json.error.message}` : ''}`, usageRecord };
  }

  const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) return { ok: false, reason: 'The AI service returned an empty response.', usageRecord };
  try {
    return { ok: true, data: JSON.parse(text) as T, usageRecord };
  } catch {
    return { ok: false, reason: 'The AI service returned malformed JSON.', usageRecord };
  }
}

/** Background-task convenience wrapper. Returns null on any failure — never throws, callers decide the fallback. */
export async function generateJson<T>(params: {
  prompt: string;
  schema: GeminiJsonSchema;
  model?: string;
  baseUrl?: string;
}): Promise<T | null> {
  const result = await generateJsonDetailed<T>({ ...params, requestType: 'backgroundTask' });
  return result.ok ? result.data : null;
}
