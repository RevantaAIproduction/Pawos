import { v4 as uuidv4 } from 'uuid';
import { pawComputeConfigStore } from './PawComputeConfigStore';
import { usageEventStore } from './UsageEventStore';
import type {
  AggregatedTurnUsage,
  NormalizedUsageRecord,
  ProviderUsageMetadata,
  UsageRequestType,
} from '../../shared/billing/UsageMeteringTypes';

/** Rounded to 4 decimal places purely for storage/display sanity — the underlying arithmetic is exact
 *  (no precision is discarded before rounding). */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Converts one real Gemini usage report into a Paw Compute number, using
 * PawComputeConfigStore's config-driven Gemini model pricing table — this is the ONLY place tokens
 * become Paw Compute. Never called from the renderer directly: the renderer only ever sends raw
 * ProviderUsageMetadata (see TurnUsageSubmission), and this function's result is what actually gets
 * charged — satisfying "the client must never be able to choose normalizedCompute/the final charge."
 *
 * PawOS is Gemini-only, so this always resolves pricing by Gemini model id — there is no
 * provider-selection step. usage.provider is expected to be 'gemini' for every real call site; it's
 * still recorded on the ledger (see NormalizedUsageRecord) purely as a durable, honest label, never
 * as a second pricing dimension.
 *
 * BILLABLE-TOKEN DERIVATION (see ProviderUsageMetadata's doc comment for the two real-response
 * identities this is built on, both verified against live Gemini payloads — not assumed):
 *
 *   freshInputTokens = max(0, promptTokenCount - cachedContentTokenCount)
 *   cachedInputTokens = cachedContentTokenCount
 *   billableOutputTokens = candidatesTokenCount + thoughtsTokenCount
 *
 * The subtraction is the correctness-critical part. `promptTokenCount` ALREADY CONTAINS the cached
 * tokens, so charging the raw prompt count at the fresh rate and then adding the cached count again
 * at the cached rate bills the cached prefix twice — which made a cache HIT cost MORE than a cache
 * MISS (measured on real responses: an uncached request billed 32.02 PC while an otherwise-identical
 * request with 36,129 cached tokens billed 34.55 PC — backwards, since a cache hit is genuinely
 * cheaper for Gemini). With the subtraction, that same warm request bills ~8.4 PC, correctly
 * reflecting real provider cost.
 *
 * `thoughtsTokenCount` is added because Gemini bills reasoning tokens at the OUTPUT rate and reports
 * them OUTSIDE `candidatesTokenCount` (confirmed: prompt + candidates + thoughts === totalTokenCount
 * exactly, on every sampled response). Omitting it under-charged every thinking-model request.
 *
 * max(0, ...) guards a malformed/renderer-supplied payload claiming more cached tokens than prompt
 * tokens — it can only ever reduce the charge to the cached rate, never produce a negative credit.
 */
export function computeNormalizedCompute(usage: ProviderUsageMetadata): number {
  const pricing = pawComputeConfigStore.resolvePricing(usage.model);
  const promptTokens = usage.inputTokens ?? 0;
  const cachedTokens = usage.cachedInputTokens ?? 0;
  const freshInputTokens = Math.max(0, promptTokens - cachedTokens);
  const billableOutputTokens = (usage.outputTokens ?? 0) + (usage.thoughtsTokens ?? 0);

  const freshInputUsd = freshInputTokens * (pricing.inputPerMillionUsd / 1_000_000);
  const cachedInputUsd = cachedTokens * (pricing.cachedInputPerMillionUsd / 1_000_000);
  const outputUsd = billableOutputTokens * (pricing.outputPerMillionUsd / 1_000_000);
  const realUsdCost = freshInputUsd + cachedInputUsd + outputUsd;
  return round(realUsdCost * pawComputeConfigStore.getPawComputePerUsd());
}

/**
 * Records one real Gemini usage report as a durable, append-only NormalizedUsageRecord and returns
 * it. One call per real Gemini API request — never per turn (see recordTurnUsage below for the
 * turn-level aggregate) and never for a request Gemini was never actually asked to make.
 *
 * Idempotent by `usage.requestId` (PawOS's own per-real-request identity — Gemini's response body
 * itself carries no stable id to key off of; see ProviderUsageMetadata's doc comment). If a record
 * already exists for this exact requestId, that existing record is returned unchanged and NOTHING
 * new is appended — this is what makes "the same real Gemini request recorded twice" produce exactly
 * one usage event, while two genuinely different real requests (even with identical token counts)
 * always get their own separate records, since each carries its own distinct requestId. A null
 * requestId (a call site not yet wired to mint one) skips the dedup check entirely and always
 * appends — the same behavior this function had before requestId existed.
 */
export function recordUsageEvent(
  usage: ProviderUsageMetadata,
  requestType: UsageRequestType,
  context: { sessionId: string | null; runId: string | null },
  fable = false
): NormalizedUsageRecord {
  if (usage.requestId) {
    const existing = usageEventStore.findByRequestId(usage.requestId);
    if (existing) return existing;
  }
  const record: NormalizedUsageRecord = {
    usageEventId: uuidv4(),
    requestId: usage.requestId,
    sessionId: context.sessionId,
    runId: context.runId,
    provider: usage.provider,
    model: usage.model,
    requestType,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    totalTokens: usage.totalTokens,
    thoughtsTokens: usage.thoughtsTokens,
    normalizedCompute: computeNormalizedCompute(usage),
    timestamp: Date.now(),
    ...(fable ? { fable: true } : {}),
  };
  usageEventStore.append(record);
  return record;
}

/**
 * Records every real Gemini request that belonged to one user-visible conversation turn (the initial
 * request plus every tool-continuation the tool-calling loop triggered inside it — see
 * ConversationRuntime.ts's buildStreamCallbacks/onTurnUsage) and returns their sum. This sum is what
 * replaces the old flat "1 credit per turn" charge; see ipc.ts's billing:recordTurnUsage handler,
 * the caller of this function. An empty `requests` array (no Gemini request was actually made —
 * e.g. a turn that was stopped before reaching the reasoning provider) correctly produces zero usage
 * and zero Paw Compute, never a fabricated minimum charge.
 */
export function recordTurnUsage(
  requests: { usage: ProviderUsageMetadata; requestType: UsageRequestType }[],
  context: { sessionId: string | null; runId: string | null },
  fable = false
): AggregatedTurnUsage {
  const records = requests.map(({ usage, requestType }) => recordUsageEvent(usage, requestType, context, fable));
  const totalNormalizedCompute = round(records.reduce((sum, r) => sum + r.normalizedCompute, 0));
  return { totalNormalizedCompute, requestCount: records.length, records };
}
