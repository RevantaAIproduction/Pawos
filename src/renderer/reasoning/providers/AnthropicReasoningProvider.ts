import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseSseStream, readErrorBody } from './httpStream';

export type AnthropicReasoningConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
};

// This provider doesn't wire up function calling (no `tools` sent, no
// onToolCall ever fired), so 'tool'-role messages never actually appear in
// its history in practice — the '' check below is just correctness parity
// with GeminiReasoningProvider, not a real tool-round-trip path today.
function toAnthropicMessages(request: ReasoningProviderRequest) {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of request.history) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    messages.push({ role: m.role, content: m.content });
  }
  if (request.input) messages.push({ role: 'user', content: request.input });
  return messages;
}

export function createAnthropicReasoningProvider(config: AnthropicReasoningConfig): ReasoningProvider {
  const baseUrl = config.baseUrl ?? 'https://api.anthropic.com/v1';
  const model = config.model ?? 'claude-3-5-sonnet-latest';

  return {
    id: 'anthropic',
    label: 'Anthropic',
    isSupported() {
      return Boolean(config.apiKey);
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();

      void (async () => {
        callbacks.onStart?.();
        let full = '';
        try {
          const res = await fetch(`${baseUrl}/messages`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: config.maxTokens ?? 1024,
              system: request.systemPrompt || undefined,
              stream: true,
              messages: toAnthropicMessages(request),
            }),
          });

          if (!res.ok) {
            throw new Error(`Anthropic request failed (${res.status}): ${await readErrorBody(res)}`);
          }

          await parseSseStream(
            res,
            (data) => {
              try {
                const json = JSON.parse(data);
                if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                  const delta: string = json.delta.text ?? '';
                  if (delta) {
                    full += delta;
                    callbacks.onDelta(delta);
                  }
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
            callbacks.onError(error instanceof Error ? error : new Error('Anthropic request failed.'));
          }
        }
      })();

      return { cancel: () => controller.abort() };
    },
  };
}
