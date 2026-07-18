import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseSseStream, readErrorBody } from './httpStream';

export type OpenAiReasoningConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
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

export function createOpenAiReasoningProvider(config: OpenAiReasoningConfig): ReasoningProvider {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  const model = config.model ?? 'gpt-4o-mini';

  return {
    id: 'openai',
    label: 'OpenAI',
    isSupported() {
      return Boolean(config.apiKey);
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();

      void (async () => {
        callbacks.onStart?.();
        let full = '';
        try {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              model,
              stream: true,
              messages: toOpenAiMessages(request),
            }),
          });

          if (!res.ok) {
            throw new Error(`OpenAI request failed (${res.status}): ${await readErrorBody(res)}`);
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
            callbacks.onError(error instanceof Error ? error : new Error('OpenAI request failed.'));
          }
        }
      })();

      return { cancel: () => controller.abort() };
    },
  };
}
