import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from '../ReasoningProvider';
import { parseNdjsonStream, readErrorBody } from './httpStream';

export type OllamaReasoningConfig = {
  baseUrl?: string;
  model: string;
};

function toOllamaMessages(request: ReasoningProviderRequest) {
  const messages: { role: string; content: string }[] = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  for (const m of request.history) {
    if (m.role === 'tool') continue;
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: request.input });
  return messages;
}

export function createOllamaReasoningProvider(config: OllamaReasoningConfig): ReasoningProvider {
  const baseUrl = (config.baseUrl ?? 'http://localhost:11434').replace(/\/$/, '');

  return {
    id: 'ollama',
    label: 'Ollama (local)',
    isSupported() {
      return true; // local daemon; actual reachability is only known at request time
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      const controller = new AbortController();

      void (async () => {
        callbacks.onStart?.();
        let full = '';
        try {
          const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.model,
              stream: true,
              messages: toOllamaMessages(request),
            }),
          });

          if (!res.ok) {
            throw new Error(`Ollama request failed (${res.status}): ${await readErrorBody(res)}`);
          }

          await parseNdjsonStream(
            res,
            (line) => {
              try {
                const json = JSON.parse(line);
                const delta: string = json.message?.content ?? '';
                if (delta) {
                  full += delta;
                  callbacks.onDelta(delta);
                }
              } catch {
                // ignore malformed line
              }
            },
            controller.signal
          );

          if (!controller.signal.aborted) callbacks.onComplete(full);
        } catch (error) {
          if (!controller.signal.aborted) {
            callbacks.onError(
              error instanceof Error ? error : new Error('Ollama request failed. Is Ollama running locally?')
            );
          }
        }
      })();

      return { cancel: () => controller.abort() };
    },
  };
}
