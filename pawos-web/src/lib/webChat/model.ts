import { randomUUID } from "crypto";
import type { AccountContext } from "../account/accountContext";
import { WebChatError, type ModelFailureDetail } from "./errors";

/**
 * The model call PawOS Web makes, and its metering. Metering is the account's existing usage
 * allowance — reserve_usage before the call, settle_usage with the provider-reported tokens after
 * it, release_usage_reservation when the call produced nothing billable — the same functions, with
 * the same arguments, that the desktop app's UsageBucketClient uses. There is no Web balance.
 */

export const WEB_MODEL = "gemini-flash-latest";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * The model endpoint. WEB_CHAT_MODEL_BASE_URL lets the local browser tests (e2e/) point the dev
 * server at a stub; it is ignored in production builds, which always use Google's endpoint.
 */
function modelBaseUrl(): string {
  const override = process.env.WEB_CHAT_MODEL_BASE_URL;
  return override && process.env.NODE_ENV !== "production" ? override : GEMINI_BASE_URL;
}

export type ModelPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface ModelContent {
  role: "user" | "model";
  parts: ModelPart[];
}

export interface ModelUsage {
  promptTokens: number;
  candidatesTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
}

export interface ModelReply {
  text: string;
  /** Why the provider stopped (STOP, MAX_TOKENS, …) — its fixed word, when it gave one. */
  finishReason?: string;
  usage: ModelUsage;
}

export interface GenerateRequest {
  system: string;
  contents: ModelContent[];
  maxOutputTokens: number;
  /** Ask for a JSON reply. */
  json?: boolean;
  timeoutMs?: number;
  /**
   * How much the model reasons before it answers. The model's reasoning is counted against
   * maxOutputTokens and against the time a call has: left at the provider's default, a step that
   * only has to name a tool or write out a file can spend the whole call reasoning and answer with
   * nothing. Unset = the provider's default.
   */
  thinking?: "low";
  /** Most provider calls this request may make (a caller's own budget); unset = this module's default. */
  attempts?: number;
  /** Told of every call made to the provider, answered or not — so a caller can keep a budget across requests. */
  onAttempt?: () => void;
}

/**
 * A chat reply has to come back before the gateway in front of PawOS Web gives up on the request
 * (60 seconds). So a call with no timeout of its own gets two tries of 26 seconds each: if the model
 * hangs or answers "busy" (429 / 5xx), it is asked once more, and if that fails too the user gets
 * PawOS's own "try again" well inside the minute — never a gateway error page. A caller that sets
 * its own timeout (a code change's long edit) keeps that timeout and gets one try, as before.
 */
export const MODEL_ATTEMPT_TIMEOUT_MS = 26_000;
export const MODEL_ATTEMPTS = 2;

/**
 * Set when the provider refused a request because of the thinking setting (HTTP 400): the setting
 * is left out from then on, so a model that doesn't take it costs one extra call, once — not an
 * outage. Process-wide, like the model itself.
 */
let thinkingRefused = false;
export function resetModelState(): void {
  thinkingRefused = false;
}

const unavailable = (detail: ModelFailureDetail, retryAfterMs?: number) => new WebChatError("model_unavailable", "Paw couldn't answer just now. Please try again.", 502, detail, retryAfterMs);

/**
 * The provider's own error class for a failed call (UNAVAILABLE, RESOURCE_EXHAUSTED, …), for the log
 * only: it is what tells an overloaded model from a quota or a configuration problem behind the
 * same HTTP status. Only that fixed word is kept — never the provider's message, which is free text.
 */
async function providerError(answer: Response): Promise<{ word: string; retryAfterMs: number | null }> {
  const body = (await answer.json().catch(() => null)) as { error?: { status?: unknown; details?: unknown } } | null;
  const status = body?.error?.status;
  return { word: typeof status === "string" && /^[A-Z_]{3,40}$/.test(status) ? ` ${status}` : "", retryAfterMs: retryAfter(answer, body?.error?.details) };
}

/**
 * How long the provider asked to be left alone, if it said: the Retry-After header (seconds, or a
 * date) or Google's RetryInfo ("retryDelay": "12s"). Null when it said nothing usable.
 */
function retryAfter(answer: Response, details: unknown): number | null {
  const header = answer.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - modelClock.now());
  }
  if (Array.isArray(details)) {
    for (const detail of details) {
      const delay = (detail as { retryDelay?: unknown } | null)?.retryDelay;
      const match = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
      if (match) return Math.round(Number(match[1]) * 1000);
    }
  }
  return null;
}

/**
 * Statuses a short wait can fix: the provider is rate-limiting, overloaded or briefly failing.
 * Anything else — a bad request, a bad key, a model that doesn't exist — fails the same way again.
 */
const transient = (status: number) => status === 429 || status === 500 || status === 502 || status === 503 || status === 504;

/** Exponential backoff with full jitter: before try n+1, a random wait up to base × 2^(n-1), capped. */
export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 4_000;
/** A call with a deadline of its own (an agent turn) gets this many tries inside that deadline. */
export const DEADLINE_ATTEMPTS = 3;
/**
 * With less than this left of a deadline, another try couldn't produce a reply worth having: the
 * call fails instead, and its caller (the CLI, for an agent turn) decides whether to ask again.
 */
export const MIN_ATTEMPT_MS = 20_000;

/** The clock and the waiting, replaceable in tests. */
export const modelClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
};

export async function generate(request: GenerateRequest): Promise<ModelReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new WebChatError("not_configured", "PawOS Web chat isn't available right now.", 503);
  // Chat: a few short tries. A call with its own deadline (an agent turn): tries inside that one
  // deadline, each given what is left of it — never past it, so the gateway's minute is kept.
  const deadlineMode = request.timeoutMs !== undefined;
  const attempts = Math.max(1, Math.min(request.attempts ?? Number.POSITIVE_INFINITY, deadlineMode ? DEADLINE_ATTEMPTS : MODEL_ATTEMPTS));
  const deadline = deadlineMode ? modelClock.now() + request.timeoutMs! : Number.POSITIVE_INFINITY;
  /**
   * The wait before another try, or null when there should be none: no tries left, a wait the
   * provider asked for that is longer than we can give, or not enough of the deadline left after it.
   */
  const nextWait = (attempt: number, asked: number | null): number | null => {
    if (attempt >= attempts) return null;
    if (asked !== null && asked > RETRY_MAX_DELAY_MS && !deadlineMode) return null;
    const wait = asked ?? Math.round(modelClock.random() * Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_MS * 2 ** (attempt - 1)));
    if (deadlineMode && deadline - modelClock.now() - wait < MIN_ATTEMPT_MS) return null;
    return wait;
  };
  let response: Response | null = null;
  for (let attempt = 1; attempt <= attempts && !response; attempt++) {
    const started = modelClock.now();
    const timeoutMs = deadlineMode ? Math.max(1, deadline - started) : MODEL_ATTEMPT_TIMEOUT_MS;
    try {
      const send = (thinking: boolean) =>
        fetch(`${modelBaseUrl()}/models/${WEB_MODEL}:generateContent`, {
          method: "POST",
          // The key goes in a header, never in the URL.
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: request.contents,
            generationConfig: {
              maxOutputTokens: request.maxOutputTokens,
              ...(request.json ? { responseMimeType: "application/json" } : {}),
              ...(thinking ? { thinkingConfig: { thinkingLevel: request.thinking } } : {}),
            },
          }),
          // What is left of this try's time: the repeat without the thinking setting gets no more.
          signal: AbortSignal.timeout(Math.max(1, timeoutMs - (modelClock.now() - started))),
        });
      const withThinking = request.thinking !== undefined && !thinkingRefused;
      request.onAttempt?.();
      let answer = await send(withThinking);
      if (answer.status === 400 && withThinking) {
        // The provider says the request is wrong, and the thinking setting is the one thing in it
        // that not every model takes. Ask once without it; if that works, never send it again.
        request.onAttempt?.();
        const plain = await send(false);
        if (plain.ok) {
          thinkingRefused = true;
          console.error("[web-chat] the model refused the thinking setting; it is left out from now on");
        }
        answer = plain;
      }
      if (answer.ok) {
        response = answer;
        break;
      }
      const failure = await providerError(answer);
      // How long and what status: what whoever reads the log needs to tell a quota problem from an outage.
      console.error(`[web-chat] model call failed: HTTP ${answer.status}${failure.word} after ${modelClock.now() - started}ms (attempt ${attempt} of ${attempts})${failure.retryAfterMs !== null ? `, provider asked to wait ${failure.retryAfterMs}ms` : ""}`);
      // "Busy" may clear on another try; anything else (a bad key, a bad request) will not.
      const wait = transient(answer.status) ? nextWait(attempt, failure.retryAfterMs) : null;
      // The provider's own suggested wait goes with the failure, for whoever may ask again later.
      if (wait === null) throw unavailable(`model_http_${answer.status}`, transient(answer.status) && failure.retryAfterMs !== null ? failure.retryAfterMs : undefined);
      console.error(`[web-chat] trying the model again in ${wait}ms`);
      await modelClock.sleep(wait);
    } catch (error) {
      if (error instanceof WebChatError) throw error;
      // No answer at all: the try ran out of time, or the connection failed.
      console.error(`[web-chat] model call got no answer after ${modelClock.now() - started}ms (attempt ${attempt} of ${attempts})`);
      // A try with a deadline is given all that is left of it: running out of time is the end of the deadline.
      const name = (error as { name?: unknown } | null)?.name;
      if (deadlineMode && (name === "TimeoutError" || name === "AbortError")) throw unavailable("model_timeout");
      const wait = nextWait(attempt, null);
      if (wait === null) throw unavailable("model_timeout");
      console.error(`[web-chat] trying the model again in ${wait}ms`);
      await modelClock.sleep(wait);
    }
  }
  if (!response) throw unavailable("model_timeout");
  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { finishReason?: unknown; content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  const reason = body.candidates?.[0]?.finishReason;
  const finishReason = typeof reason === "string" && /^[A-Z_]{3,40}$/.test(reason) ? reason : undefined;
  if (!text) {
    // Why there was nothing — the provider's fixed word only (MAX_TOKENS, SAFETY, …): it is what
    // tells a reply that ran out of room from one that was withheld.
    console.error(`[web-chat] model answered with nothing${finishReason ? ` (finish reason ${finishReason})` : ""}`);
    throw unavailable("model_empty_reply");
  }
  // A reply without usage counts has an unknown cost, not a zero one. The zeros below are what
  // settle_usage is told, and it charges a settlement with no prompt tokens at the full reservation.
  if (typeof body.usageMetadata?.promptTokenCount !== "number" || body.usageMetadata.promptTokenCount <= 0) {
    console.error("[web-chat] the model reported no usage for a completed call; it is settled at its full reservation");
  }
  const usage = body.usageMetadata ?? {};
  return {
    text,
    ...(finishReason ? { finishReason } : {}),
    usage: {
      promptTokens: usage.promptTokenCount ?? 0,
      candidatesTokens: usage.candidatesTokenCount ?? 0,
      cachedTokens: usage.cachedContentTokenCount ?? 0,
      thoughtsTokens: usage.thoughtsTokenCount ?? 0,
    },
  };
}

export function usageLimitMessage(reason: unknown): string {
  if (reason === "plan_weekly_paced") return "You've reached this week's usage pace for your plan. It resets soon — or continue in the PawOS desktop app.";
  if (reason === "plan_exhausted" || reason === "no_allowance") return "Your plan's included usage is used up. Add usage or upgrade to keep going.";
  return "Usage can't be confirmed right now. Please try again in a moment.";
}

/** An upper bound on a request's input size, in bytes — enough for reserve_usage, which settles to real usage. */
export function inputUpperBound(request: Pick<GenerateRequest, "system" | "contents">): number {
  let bytes = Buffer.byteLength(request.system, "utf8");
  for (const content of request.contents) {
    for (const part of content.parts) bytes += "text" in part ? Buffer.byteLength(part.text, "utf8") : 2_000;
  }
  return bytes;
}

/**
 * One model call charged to the account's usage allowance, settled immediately: reserve → call →
 * settle (or release when the call failed). Refused before the call when the allowance can't fund
 * it. For calls whose result is kept regardless of what happens next (a frontend change's steps).
 */
export async function meteredGenerate(account: AccountContext, meter: { requestKey: string; category: string }, request: GenerateRequest): Promise<ModelReply> {
  const reservation = await account.supabase.rpc("reserve_usage", {
    p_request_key: `${meter.requestKey}:${randomUUID().slice(0, 8)}`.slice(0, 120),
    p_model: WEB_MODEL,
    p_input_tokens: inputUpperBound(request),
    p_input_is_upper_bound: true,
    p_max_output_tokens: request.maxOutputTokens,
    p_category: meter.category,
    p_scope: "standard",
  });
  const reserved = (reservation.data ?? null) as { ok?: boolean; reservationId?: string; maxOutputTokens?: number; reason?: string } | null;
  if (reservation.error || !reserved?.ok || typeof reserved.reservationId !== "string") {
    throw new WebChatError("usage_limit_reached", usageLimitMessage(reservation.error ? "service_unavailable" : reserved?.reason), reservation.error ? 503 : 402);
  }
  const reservationId = reserved.reservationId;
  const maxOutputTokens = typeof reserved.maxOutputTokens === "number" && reserved.maxOutputTokens > 0 ? Math.min(request.maxOutputTokens, reserved.maxOutputTokens) : request.maxOutputTokens;

  let reply: ModelReply;
  try {
    reply = await generate({ ...request, maxOutputTokens });
  } catch (error) {
    await account.supabase.rpc("release_usage_reservation", { p_reservation_id: reservationId }).then(undefined, () => undefined);
    throw error;
  }
  const settled = await account.supabase.rpc("settle_usage", {
    p_reservation_id: reservationId,
    p_usage_event_id: `${meter.requestKey}:${randomUUID().slice(0, 8)}`.slice(0, 120),
    p_prompt_tokens: reply.usage.promptTokens,
    p_candidates_tokens: reply.usage.candidatesTokens,
    p_cached_tokens: reply.usage.cachedTokens,
    p_thoughts_tokens: reply.usage.thoughtsTokens,
  });
  // An unsettled reservation is closed by the server at its full amount, so usage is never free.
  if (settled.error) console.error("[web-chat] settle_usage failed; the server will close the reservation.");
  return reply;
}
