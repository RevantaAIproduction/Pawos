import { measureGeminiInputTokens } from '../../shared/ai/geminiInputTokens';
import { authorizeModelCall } from './ModelCallAuthorizer';
import { usageBucketClient } from './UsageBucketClient';
import type { ModelCallReservation } from '../../shared/billing/UsageBucketTypes';

type GeminiBody = { contents?: unknown; systemInstruction?: unknown; tools?: unknown; generationConfig?: Record<string, unknown> };
type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
};

/**
 * Main-process Gemini call sites (career tools, file classification, PR review, meeting summaries):
 * count the exact request's input tokens, then ask for a reservation — the same per-call path the
 * conversation provider uses. On success the body's maxOutputTokens is set to the granted value
 * (thinking is inside it), so the call can never cost more than what was reserved.
 */
export async function reserveMainProcessGeminiCall(params: {
  baseUrl: string;
  model: string;
  apiKey: string;
  body: GeminiBody;
  requestKey: string;
  category: string;
  maxOutputTokens?: number;
}): Promise<ModelCallReservation> {
  const measured = await measureGeminiInputTokens({ baseUrl: params.baseUrl, model: params.model, apiKey: params.apiKey, body: params.body });
  const reservation = await authorizeModelCall({
    requestKey: params.requestKey,
    model: params.model,
    inputTokens: measured.tokens,
    inputIsUpperBound: measured.upperBound,
    maxOutputTokens: params.maxOutputTokens,
    category: params.category,
  });
  if (reservation.ok && reservation.maxOutputTokens !== null) {
    params.body.generationConfig = { ...(params.body.generationConfig ?? {}), maxOutputTokens: reservation.maxOutputTokens };
  }
  return reservation;
}

/** Settles the reservation with Gemini's usageMetadata, or releases it when no usage was reported. */
export function finishMainProcessGeminiCall(reservationId: string | null, usageEventId: string, usage: UsageMetadata | null | undefined): void {
  if (!reservationId) return;
  if (usage && typeof usage === 'object') {
    void usageBucketClient.settle(reservationId, usageEventId, {
      promptTokens: usage.promptTokenCount ?? 0,
      candidatesTokens: usage.candidatesTokenCount ?? 0,
      cachedTokens: usage.cachedContentTokenCount ?? 0,
      thoughtsTokens: usage.thoughtsTokenCount ?? 0,
    });
  } else {
    void usageBucketClient.release(reservationId);
  }
}
