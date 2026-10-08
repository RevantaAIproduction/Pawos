import { randomUUID } from "crypto";
import type { AccountContext } from "../account/accountContext";
import { WebChatError } from "./errors";

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
  usage: ModelUsage;
}

export interface GenerateRequest {
  system: string;
  contents: ModelContent[];
  maxOutputTokens: number;
  /** Ask for a JSON reply. */
  json?: boolean;
  timeoutMs?: number;
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

const unavailable = () => new WebChatError("model_unavailable", "Paw couldn't answer just now. Please try again.", 502);

export async function generate(request: GenerateRequest): Promise<ModelReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new WebChatError("not_configured", "PawOS Web chat isn't available right now.", 503);
  const attempts = request.timeoutMs === undefined ? MODEL_ATTEMPTS : 1;
  const timeoutMs = request.timeoutMs ?? MODEL_ATTEMPT_TIMEOUT_MS;
  let response: Response | null = null;
  for (let attempt = 1; attempt <= attempts && !response; attempt++) {
    const started = Date.now();
    const last = attempt === attempts;
    try {
      const answer = await fetch(`${modelBaseUrl()}/models/${WEB_MODEL}:generateContent`, {
        method: "POST",
        // The key goes in a header, never in the URL.
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.contents,
          generationConfig: { maxOutputTokens: request.maxOutputTokens, ...(request.json ? { responseMimeType: "application/json" } : {}) },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (answer.ok) {
        response = answer;
        break;
      }
      // How long and what status: what whoever reads the log needs to tell a quota problem from an outage.
      console.error(`[web-chat] model call failed: HTTP ${answer.status} after ${Date.now() - started}ms (attempt ${attempt} of ${attempts})`);
      // "Busy" may clear on a second try; anything else (a bad key, a bad request) will not.
      if (last || !(answer.status === 429 || answer.status >= 500)) throw unavailable();
    } catch (error) {
      if (error instanceof WebChatError) throw error;
      console.error(`[web-chat] model call got no answer after ${Date.now() - started}ms (attempt ${attempt} of ${attempts})`);
      if (last) throw unavailable();
    }
  }
  if (!response) throw unavailable();
  const body = (await response.json().catch(() => ({}))) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new WebChatError("model_unavailable", "Paw couldn't answer just now. Please try again.", 502);
  const usage = body.usageMetadata ?? {};
  return {
    text,
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
