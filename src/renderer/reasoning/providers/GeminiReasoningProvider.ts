import { v4 as uuidv4 } from 'uuid';
import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseSseStream, readErrorBody } from './httpStream';

export type GeminiReasoningConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: unknown }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
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
function toGeminiContents(request: ReasoningProviderRequest): GeminiContent[] {
  const contents: GeminiContent[] = [];
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
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name ?? 'unknown_tool', response: { result: m.content } } }],
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
  const model = config.model ?? 'gemini-flash-latest';

  return {
    id: 'gemini',
    label: 'Gemini',
    isSupported() {
      return Boolean(config.apiKey);
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();
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
        try {
          const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.apiKey)}`;
          const res = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: toGeminiContents(request),
              ...(request.systemPrompt
                ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } }
                : {}),
              ...(toGeminiTools(request) ? { tools: toGeminiTools(request) } : {}),
            }),
          });
          resetIdleTimer();

          if (!res.ok) {
            throw new Error(`Gemini request failed (${res.status}): ${await readErrorBody(res)}`);
          }

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
              } catch {
                // ignore malformed chunk
              }
            },
            controller.signal
          );

          clearIdleTimer();
          if (!controller.signal.aborted) callbacks.onComplete(full);
        } catch (error) {
          clearIdleTimer();
          if (!controller.signal.aborted) {
            callbacks.onError(error instanceof Error ? error : new Error('Gemini request failed.'));
          } else {
            // Aborted by our own idle timeout (not a manual .cancel()) — surface it as a real error instead of silently vanishing.
            const reason = controller.signal.reason;
            if (reason instanceof Error) callbacks.onError(reason);
          }
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
