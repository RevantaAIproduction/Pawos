import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseSseStream, readErrorBody } from './httpStream';

/**
 * Generic client for any OpenAI-compatible /chat/completions endpoint.
 * Covers OpenRouter and LM Studio (both expose this exact API shape);
 * also usable for any future self-hosted server that speaks the same protocol.
 */
export type OpenAiCompatibleReasoningConfig = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
};

function toOpenAiMessages(request: ReasoningProviderRequest) {
  const messages: { role: string; content: string }[] = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  for (const m of request.history) {
    if (m.role === 'tool') continue;
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: request.input });
  return messages;
}

export function createOpenAiCompatibleReasoningProvider(
  config: OpenAiCompatibleReasoningConfig
): ReasoningProvider {
  return {
    id: config.id,
    label: config.label,
    isSupported() {
      return Boolean(config.baseUrl);
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();

      void (async () => {
        callbacks.onStart?.();
        let full = '';
        try {
          const res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              ...(config.extraHeaders ?? {}),
            },
            body: JSON.stringify({
              model: config.model,
              stream: true,
              messages: toOpenAiMessages(request),
            }),
          });

          if (!res.ok) {
            throw new Error(`${config.label} request failed (${res.status}): ${await readErrorBody(res)}`);
          }

          await parseSseStream(
            res,
            (data) => {
              if (data === '[DONE]') return;
              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta) {
                  full += delta;
                  callbacks.onDelta(delta);
                }
              } catch {
                // ignore malformed chunk
              }
            },
            controller.signal
          );

          if (!controller.signal.aborted) callbacks.onComplete(full);
        } catch (error) {
          if (!controller.signal.aborted) {
            callbacks.onError(error instanceof Error ? error : new Error(`${config.label} request failed.`));
          }
        }
      })();

      return { cancel: () => controller.abort() };
    },
  };
}

export function createOpenRouterReasoningProvider(config: { apiKey: string; model?: string }): ReasoningProvider {
  return createOpenAiCompatibleReasoningProvider({
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: config.model ?? 'openrouter/auto',
    apiKey: config.apiKey,
  });
}

export function createLmStudioReasoningProvider(config: { baseUrl?: string; model: string }): ReasoningProvider {
  return createOpenAiCompatibleReasoningProvider({
    id: 'lm-studio',
    label: 'LM Studio',
    baseUrl: config.baseUrl ?? 'http://localhost:1234/v1',
    model: config.model,
  });
}
