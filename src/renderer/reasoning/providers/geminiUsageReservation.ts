import { measureGeminiInputTokens } from '../../../shared/ai/geminiInputTokens';
import type {
  ModelCallReservation,
  ModelCallReservationRequest,
  ModelCallUsage,
  UsageLimitReason,
} from '../../../shared/billing/UsageBucketTypes';

/**
 * The renderer side of "reserve before every paid Gemini call": countTokens on the exact request →
 * billing:reserveModelCall (main + the server decide) → call Gemini with the granted
 * maxOutputTokens → settle with usageMetadata, or release when the call produced no usage.
 */
export type GeminiUsageGate = {
  reserve(request: ModelCallReservationRequest): Promise<ModelCallReservation>;
  settle(params: { reservationId: string; usageEventId: string; usage: ModelCallUsage }): Promise<void>;
  release(reservationId: string): Promise<void>;
};

/** A paid call refused before it was sent — carries the customer-facing message only. */
export class UsageLimitError extends Error {
  constructor(message: string, readonly reason: UsageLimitReason) {
    super(message);
    this.name = 'UsageLimitError';
  }
}

/** The preload bridge's usage gate. Null outside the desktop app (unit tests, web previews). */
export function bridgeUsageGate(): GeminiUsageGate | null {
  const bridge = (globalThis as { __pawos_ipc__?: Record<string, unknown> }).__pawos_ipc__;
  if (!bridge || typeof bridge.billingReserveModelCall !== 'function') return null;
  const call = bridge as unknown as {
    billingReserveModelCall: GeminiUsageGate['reserve'];
    billingSettleModelCall: GeminiUsageGate['settle'];
    billingReleaseModelCall: GeminiUsageGate['release'];
  };
  return {
    reserve: (request) => call.billingReserveModelCall(request),
    settle: (params) => call.billingSettleModelCall(params),
    release: (reservationId) => call.billingReleaseModelCall(reservationId),
  };
}

type GeminiBody = { contents?: unknown; systemInstruction?: unknown; tools?: unknown; generationConfig?: unknown };

/**
 * Reserves one Gemini call. On success the body's maxOutputTokens is set to the granted value —
 * the hard cap that keeps the call inside its reservation (thinking tokens count inside it).
 * Throws UsageLimitError when the call must not be made (fail closed). With no gate (outside the
 * desktop app) the request goes ahead unreserved.
 */
export async function reserveGeminiCall(params: {
  gate: GeminiUsageGate | null;
  baseUrl: string;
  model: string;
  apiKey: string;
  body: GeminiBody;
  requestKey: string;
  category: string;
  pawModelId?: string;
  maxOutputTokens?: number;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}): Promise<{ reservationId: string | null; inputTokens: number }> {
  const config = (params.body.generationConfig ?? {}) as Record<string, unknown>;
  const ownLimit = Number(params.maxOutputTokens ?? config.maxOutputTokens);
  const requested = Number.isFinite(ownLimit) && ownLimit > 0 ? ownLimit : undefined;
  if (!params.gate) return { reservationId: null, inputTokens: 0 };
  const measured = await measureGeminiInputTokens({
    baseUrl: params.baseUrl,
    model: params.model,
    apiKey: params.apiKey,
    body: params.body,
    fetchImpl: params.fetchImpl,
  });
  let reservation: ModelCallReservation;
  try {
    reservation = await params.gate.reserve({
      requestKey: params.requestKey,
      model: params.model,
      inputTokens: measured.tokens,
      inputIsUpperBound: measured.upperBound,
      maxOutputTokens: requested,
      category: params.category,
      pawModelId: params.pawModelId,
    });
  } catch {
    throw new UsageLimitError(
      "Usage service unavailable\nPawOS couldn't confirm your remaining PC, so the request wasn't sent. Check your connection and try again.",
      'service_unavailable',
    );
  }
  if (!reservation.ok) throw new UsageLimitError(reservation.message, reservation.reason);
  if (reservation.maxOutputTokens !== null) {
    params.body.generationConfig = { ...config, maxOutputTokens: reservation.maxOutputTokens };
  }
  return { reservationId: reservation.reservationId, inputTokens: measured.tokens };
}

/** Gemini usageMetadata → the settlement shape. */
export function usageFromMetadata(meta: unknown): ModelCallUsage | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    promptTokens: n(m.promptTokenCount),
    candidatesTokens: n(m.candidatesTokenCount),
    cachedTokens: n(m.cachedContentTokenCount),
    thoughtsTokens: n(m.thoughtsTokenCount),
  };
}

/**
 * Closes a reservation after the call: settle with the reported usage; release when the call was
 * rejected without usage. A call that succeeded but reported no usage is left open — the server
 * then charges the full reservation (never less).
 */
export function finishGeminiCall(
  gate: GeminiUsageGate | null,
  reservationId: string | null,
  usageEventId: string,
  outcome: { usage: ModelCallUsage | null; requestFailed: boolean },
): void {
  if (!gate || !reservationId) return;
  if (outcome.usage) {
    void gate.settle({ reservationId, usageEventId, usage: outcome.usage }).catch(() => undefined);
  } else if (outcome.requestFailed) {
    void gate.release(reservationId).catch(() => undefined);
  }
}
