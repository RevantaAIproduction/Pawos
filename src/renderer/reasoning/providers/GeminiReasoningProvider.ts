import { v4 as uuidv4 } from 'uuid';
import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseSseStream, readErrorBody } from './httpStream';
import {
  auditGeminiRequest,
  countGeminiInputTokens,
  formatGeminiInputAudit,
  isGeminiInputAuditEnabled,
  type GeminiRequestBody,
} from './geminiInputAudit';
import {
  bridgeUsageGate,
  finishGeminiCall,
  reserveGeminiCall,
  usageFromMetadata,
  type GeminiUsageGate,
} from './geminiUsageReservation';
import type { ModelCallUsage } from '../../../shared/billing/UsageBucketTypes';

export type GeminiReasoningConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Usage reservation gate (defaults to the desktop bridge). Every request is reserved before it is sent. */
  usageGate?: GeminiUsageGate | null;
  /** The active Paw model (e.g. 'paw-fable' is funded by credits only). */
  getPawModelId?: () => string | undefined;
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } }
  | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

/**
 * Gemini requires strict user/model role alternation — two consecutive
 * `user` entries (or two `model` entries) make generateContent reject the
 * whole request with a 400. That can genuinely happen here: if a turn gets
 * interrupted/cancelled mid-stream (a new message arrives before the model
 * replied), its user message is left in history with no matching model
 * reply, and the next turn's user message would otherwise land right after
 * it. Rather than trying to prevent every way that can happen upstream,
 * merge adjacent same-role entries (concatenating their parts) as a last
 * line of defense — no information is dropped, the request is just always
 * well-formed.
 */
function mergeAdjacentSameRole(contents: GeminiContent[]): GeminiContent[] {
  const merged: GeminiContent[] = [];
  for (const entry of contents) {
    const last = merged[merged.length - 1];
    if (last && last.role === entry.role) {
      last.parts.push(...entry.parts);
    } else {
      merged.push({ role: entry.role, parts: [...entry.parts] });
    }
  }
  return merged;
}

/**
 * 'tool' messages and assistant messages with toolCalls only exist once a
 * turn continuation happens (see ReasoningRuntime.provideToolResult /
 * continueTurn) — a plain chat history never produces them, so this stays
 * a no-op extension of the original user/assistant-only serialization.
 */
/** Only the newest tool results keep their images in each request — an older screenshot is replaced by a note, so evidence doesn't re-send every image on every turn. */
const MAX_TOOL_RESULTS_WITH_IMAGES = 2;

function toGeminiContents(request: ReasoningProviderRequest): GeminiContent[] {
  const contents: GeminiContent[] = [];
  const imageBearing = request.history.filter((m) => m.role === 'tool' && (m.images?.length ?? 0) > 0);
  const keepImagesFor = new Set(imageBearing.slice(-MAX_TOOL_RESULTS_WITH_IMAGES).map((m) => m.id));
  for (const m of request.history) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] });
    } else if (m.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const call of m.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: call.arguments ?? {} },
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        });
      }
      if (parts.length > 0) contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const images = m.images ?? [];
      const sendImages = images.length > 0 && keepImagesFor.has(m.id);
      const note = images.length > 0 && !sendImages ? ' (The image from this earlier result is no longer attached — inspect it again if you need it.)' : '';
      contents.push({
        role: 'user',
        parts: [
          { functionResponse: { name: m.name ?? 'unknown_tool', response: { result: m.content + note } } },
          // The image itself, beside the function response in the same turn — what makes a vision model actually see it.
          ...(sendImages ? images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })) : []),
        ],
      });
    }
  }
  // '' means "tool-result continuation" (ReasoningRuntime.continueTurn) —
  // there's nothing new from the user, so no trailing turn gets appended;
  // the last content above (a functionResponse) is what the model responds to.
  if (request.input) contents.push({ role: 'user', parts: [{ text: request.input }] });
  return mergeAdjacentSameRole(contents);
}

function toGeminiTools(request: ReasoningProviderRequest) {
  if (!request.tools || request.tools.length === 0) return undefined;
  return [
    {
      function_declarations: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

/** The exact JSON body sent to streamGenerateContent — shared with the dev-only input audit so it
 *  always measures what is really sent. */
export function buildGeminiRequestBody(request: ReasoningProviderRequest): GeminiRequestBody {
  return {
    contents: toGeminiContents(request),
    ...(request.systemPrompt
      ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } }
      : {}),
    ...(toGeminiTools(request) ? { tools: toGeminiTools(request) } : {}),
    // Explicit output limit for authorization/cost-bounding: 8,000 tokens is conservative
    // for Flash and below, covers typical autonomous task responses without truncating normal
    // conversation responses in non-autonomous contexts. This limit ensures pre-request cost
    // authorization is defensible: max output PC = 8K tokens * pricing.outputPerMillionUsd.
    generationConfig: {
      maxOutputTokens: 8000,
    },
  };
}

/** Development builds only: logs how this request's input splits by category (never the key or any
 *  user text), then the real total from countTokens once it arrives. Never blocks the request. */
function logGeminiInputAudit(baseUrl: string, model: string, apiKey: string, body: GeminiRequestBody, input: string, contextPath?: string): void {
  if (!isGeminiInputAuditEnabled()) return;
  try {
    console.info(formatGeminiInputAudit(model, auditGeminiRequest(body, input), contextPath));
    void countGeminiInputTokens(baseUrl, model, apiKey, body).then((real) => {
      if (real !== null) console.info(`[Gemini Input Audit] model=${model} realTotalInputTokens (countTokens): ${real}`);
    });
  } catch {
    // diagnostics must never affect a real request
  }
}

/**
 * No activity (not even the connection opening, not a single SSE chunk) for
 * this long means the request is genuinely dead, not just a slow model —
 * confirmed directly: a real hang left a turn stuck on "generating-response"
 * indefinitely with no error, no timeout, and no way to recover short of
 * restarting the app. Chosen well above every legitimate delay observed in
 * practice (worst case seen: ~160s including real tool execution time, not
 * just waiting on Gemini) so this only trips on a truly stalled connection.
 */
const IDLE_TIMEOUT_MS = 180_000;

export function createGeminiReasoningProvider(config: GeminiReasoningConfig): ReasoningProvider {
  const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const model = config.model ?? 'gemini-3.6-flash';

  return {
    id: 'gemini',
    label: 'Gemini',
    model,
    isSupported() {
      return Boolean(config.apiKey);
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();
      // PawOS's own per-request identity for this one real outgoing streaming call — Gemini's
      // response body carries no stable id of its own (see UsageMeteringTypes.ts's doc comment on
      // ProviderUsageMetadata.requestId). Minted once here because exactly one streamResponse() call
      // is exactly one real HTTP request: there is no retry inside this provider, and a genuine
      // retry (a fresh streamResponse() call) correctly gets its own new id. Gemini reports
      // cumulative usage on every streamed chunk, so this same id rides every intermediate onUsage
      // callback — harmless, since ReasoningRuntime keeps only the last (authoritative) one, so the
      // usage ledger still sees exactly one record per real request.
      const requestId = uuidv4();
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(
          () => controller.abort(new Error(`No response from Gemini for ${Math.round(IDLE_TIMEOUT_MS / 1000)}s — the connection appears to be stuck.`)),
          IDLE_TIMEOUT_MS
        );
      };
      const clearIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = undefined;
      };

      void (async () => {
        callbacks.onStart?.();
        resetIdleTimer();
        let full = '';
        const usageGate = config.usageGate === undefined ? bridgeUsageGate() : config.usageGate;
        let reservationId: string | null = null;
        let reservedInputTokens = 0;
        let lastUsage: ModelCallUsage | null = null;
        let responseStarted = false;
        try {
          const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;

          const requestBody = buildGeminiRequestBody(request);
          logGeminiInputAudit(baseUrl, model, config.apiKey, requestBody, request.input, request.contextPath);

          // Paid usage: reserve the worst case on the server BEFORE sending (fails closed). Sets the
          // granted maxOutputTokens on the body — the cap that keeps the call inside its reservation.
          const reserved = await reserveGeminiCall({
            gate: usageGate,
            baseUrl,
            model,
            apiKey: config.apiKey,
            body: requestBody,
            requestKey: requestId,
            category: 'chat',
            pawModelId: config.getPawModelId?.(),
          });
          reservationId = reserved.reservationId;
          reservedInputTokens = reserved.inputTokens;
          if (controller.signal.aborted) throw controller.signal.reason ?? new Error('Cancelled.');

          // Phase 2 Active Time: Server-authoritative measurement of exact AI execution
          // We report the exact boundaries of the network request so the Main Process can
          // measure active time using its own clock, completely excluding tool wait times.
          (globalThis as any).__pawos_ipc__?.billingReportRequestStart(requestId).catch(() => {});

          const res = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          resetIdleTimer();

          if (!res.ok) {
            throw new Error(`Gemini request failed (${res.status}): ${await readErrorBody(res)}`);
          }
          responseStarted = true;

          await parseSseStream(
            res,
            (data) => {
              resetIdleTimer();
              try {
                const json = JSON.parse(data);
                const parts = json.candidates?.[0]?.content?.parts ?? [];
                for (const part of parts) {
                  if (typeof part.text === 'string' && part.text) {
                    full += part.text;
                    callbacks.onDelta(part.text);
                  }
                  if (part.functionCall) {
                    callbacks.onToolCall?.({
                      id: uuidv4(),
                      name: part.functionCall.name,
                      arguments: part.functionCall.args ?? {},
                      // Must be captured here and replayed verbatim on any
                      // later continuation — see ReasoningToolCall.thoughtSignature.
                      thoughtSignature: typeof part.thoughtSignature === 'string' ? part.thoughtSignature : undefined,
                    });
                  }
                }
                // Real, authoritative usage — Gemini attaches this to every streamed chunk with
                // cumulative counts, so the LAST chunk that carries it has the final totals. Reporting
                // on every occurrence (rather than only the last) means the runtime always has the
                // most recent real number even if the stream is cancelled mid-flight.
                const usageMetadata = json.usageMetadata;
                if (usageMetadata && typeof usageMetadata === 'object') {
                  lastUsage = usageFromMetadata(usageMetadata);
                  callbacks.onUsage?.({
                    provider: 'gemini',
                    model,
                    inputTokens: typeof usageMetadata.promptTokenCount === 'number' ? usageMetadata.promptTokenCount : null,
                    outputTokens: typeof usageMetadata.candidatesTokenCount === 'number' ? usageMetadata.candidatesTokenCount : null,
                    cachedInputTokens: typeof usageMetadata.cachedContentTokenCount === 'number' ? usageMetadata.cachedContentTokenCount : null,
                    totalTokens: typeof usageMetadata.totalTokenCount === 'number' ? usageMetadata.totalTokenCount : null,
                    thoughtsTokens: typeof usageMetadata.thoughtsTokenCount === 'number' ? usageMetadata.thoughtsTokenCount : null,
                    requestId,
                  });
                }
              } catch {
                // ignore malformed chunk
              }
            },
            controller.signal
          );

          clearIdleTimer();
          if (!controller.signal.aborted) {
            callbacks.onComplete(full);
          }
        } catch (error) {
          clearIdleTimer();
          
          if (!controller.signal.aborted) {
            callbacks.onError(error instanceof Error ? error : new Error('Gemini request failed.'));
          } else {
            // Aborted by our own idle timeout (not a manual .cancel()) — surface it as a real error instead of silently vanishing.
            const reason = controller.signal.reason;
            if (reason instanceof Error) callbacks.onError(reason);
          }
        } finally {
          (globalThis as any).__pawos_ipc__?.billingReportRequestEnd(requestId).catch(() => {});
          // Close the reservation: the reported usage; or, for a stream stopped before Gemini reported
          // usage, the input plus the text received so far (the server caps it at the reservation);
          // or a release when the request was rejected before any response.
          const usage =
            lastUsage ??
            (responseStarted ? { promptTokens: reservedInputTokens, candidatesTokens: Math.ceil(full.length / 4), cachedTokens: 0, thoughtsTokens: 0 } : null);
          finishGeminiCall(usageGate, reservationId, requestId, { usage, requestFailed: !responseStarted });
        }
      })();

      return {
        cancel: () => {
          clearIdleTimer();
          controller.abort();
        },
      };
    },
  };
}
