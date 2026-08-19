/**
 * Real, provider-reported usage metadata for a single model request — never estimated or fabricated
 * when a provider doesn't return a real number. Fields a provider genuinely doesn't supply are left
 * null (e.g. the Local in-process fallback provider never calls a real API at all, so every field is
 * null there). See src/renderer/reasoning/providers/*.ts for where each provider populates this from
 * its own real response payload.
 *
 * `requestId`: Gemini's `generateContent`/`streamGenerateContent` response body carries no documented,
 * stable per-request identifier (confirmed by direct inspection of every real response payload this
 * codebase parses — unlike e.g. OpenAI's `id` field, Gemini returns none). This field is therefore
 * PawOS's OWN identity, not Gemini's: a uuidv4() minted once, at the exact moment the real outgoing
 * HTTP request is issued, by the caller that made that one specific fetch() call — never reused across
 * a retry (a retry is a new real request, so it gets its own new id) and never shared between two
 * different real requests. This is what makes usage-event recording idempotent (see
 * UsageMeteringEngine.recordUsageEvent) — it identifies "this one real network call," not anything
 * Gemini itself reports. Left `null` only for call sites not yet wired to mint one.
 *
 * TOKEN SEMANTICS — verified against real Gemini `usageMetadata` payloads (4 live calls on the real
 * PawOS conversation path, 2026-08-18), not assumed from documentation:
 *
 *   promptTokenCount + candidatesTokenCount + thoughtsTokenCount === totalTokenCount
 *   cachedContentTokenCount ⊆ promptTokenCount   (a SUBSET, already inside it)
 *
 * Both identities held exactly on every sampled response (e.g. 39,212 + 649 + 248 = 40,109; a warm
 * request reporting cached=36,129 still reported prompt=39,212, not 75,341). Two consequences the
 * fields below encode:
 *   - `inputTokens` is the RAW promptTokenCount, cached tokens included. Billable fresh input is
 *     therefore `inputTokens - cachedInputTokens`, never `inputTokens` alone — see
 *     UsageMeteringEngine.computeNormalizedCompute(), which is the only place that math happens.
 *   - `thoughtsTokens` is genuinely separate from `outputTokens` (NOT nested inside it), and Gemini
 *     bills it at the output rate — so it is added to billable output exactly once, with no
 *     double-counting risk.
 */
export type ProviderUsageMetadata = {
  provider: string;
  model: string;
  /** RAW promptTokenCount — includes cachedInputTokens. Never pre-subtracted by a call site. */
  inputTokens: number | null;
  /** candidatesTokenCount only — reasoning/thinking tokens are reported separately in thoughtsTokens. */
  outputTokens: number | null;
  /** cachedContentTokenCount — a subset of inputTokens, billed at the (much cheaper) cached rate. */
  cachedInputTokens: number | null;
  totalTokens: number | null;
  /** thoughtsTokenCount — real reasoning tokens Gemini bills at the OUTPUT rate. Null when the model
   *  reported none (non-thinking models never emit this field at all). */
  thoughtsTokens: number | null;
  requestId: string | null;
};

/** What kind of real Gemini request this usage record represents. 'conversationTurn' is the main
 *  chat turn's initial request (or a recovery retry of it); 'toolContinuation' is every further real
 *  request the tool-calling loop triggers inside the same turn (see ConversationRuntime.ts's
 *  buildStreamCallbacks()). 'backgroundTask' is a real, non-interactive Gemini call made outside the
 *  main conversation loop entirely — transcription/summarization/signal-detection (callGemini in
 *  CommunicationTranscription.ts), file classification/PR review JSON calls (generateJson in
 *  geminiJson.ts), and reference-image analysis (analyzeUiReference.ts) all use this value. */
export type UsageRequestType = 'conversationTurn' | 'toolContinuation' | 'backgroundTask';

/**
 * One real, provider-reported model request, normalized into Paw Compute. normalizedCompute is
 * always computed main-process-side from PawComputeConfigStore's config-driven weight table (see
 * UsageMeteringEngine.ts) — a renderer/caller can never supply it directly. Append-only once written;
 * UsageEventStore.ts never mutates a past record.
 */
export type NormalizedUsageRecord = {
  usageEventId: string;
  /** PawOS's own per-real-request identity (see ProviderUsageMetadata's doc comment) — the key
   *  UsageEventStore.findByRequestId() uses to make recordUsageEvent idempotent. Null for a usage
   *  report that arrived with no requestId (an old/not-yet-wired call site) — such a record is never
   *  deduplicated against, since there is nothing reliable to match it on. */
  requestId: string | null;
  sessionId: string | null;
  runId: string | null;
  provider: string;
  model: string;
  requestType: UsageRequestType;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
  /** Real reasoning tokens billed at the output rate — persisted so the Usage Details view can show
   *  the same real breakdown the charge was computed from. Null when the model reported none. */
  thoughtsTokens: number | null;
  normalizedCompute: number;
  timestamp: number;
  /** Set by the main-process IPC handler when pawModelId === 'paw-fable'. Fable usage is excluded
   *  from rolling Paw Compute windows — Fable is gated on bonusThisPeriod (Paw Credits) and must
   *  not consume from the tier's included allowance. Only the main process sets this; the renderer
   *  cannot forge it via billing:reportUsageEvent (that handler never receives a pawModelId). */
  fable?: boolean;
};

/** The sum of every real model request that belonged to one user-visible conversation turn (the
 *  initial request plus every tool-continuation triggered inside it) — this is what actually gets
 *  charged, replacing the old flat "1 credit per turn" regardless of how many real requests or
 *  tokens the turn actually used. */
export type AggregatedTurnUsage = {
  totalNormalizedCompute: number;
  requestCount: number;
  records: NormalizedUsageRecord[];
};

/** What the renderer sends for one completed turn — raw, provider-reported usage only. The renderer
 *  never computes or supplies normalizedCompute itself; see UsageMeteringEngine.ts's own doc comment
 *  on why normalization is main-process-only (the client must never be able to choose its own final
 *  charge). */
export type TurnUsageSubmission = {
  sessionId: string | null;
  runId: string | null;
  requests: { usage: ProviderUsageMetadata; requestType: UsageRequestType }[];
};
