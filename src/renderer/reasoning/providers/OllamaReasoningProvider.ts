import { v4 as uuidv4 } from 'uuid';
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

type OllamaMessage = {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: unknown } }[];
};

/**
 * Ollama's /api/chat pairs a 'tool' message with the model's own preceding
 * tool_calls purely by sequence (no tool_call_id concept, unlike OpenAI) — so
 * an assistant message's toolCalls and the following tool-result messages
 * just need to appear in the same order they were issued, which the
 * existing ReasoningMessage history already preserves.
 */
function toOllamaMessages(request: ReasoningProviderRequest): OllamaMessage[] {
  const messages: OllamaMessage[] = [];
  if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
  for (const m of request.history) {
    if (m.role === 'assistant') {
      const toolCalls = (m.toolCalls ?? []).map((call) => ({
        function: { name: call.name, arguments: call.arguments ?? {} },
      }));
      messages.push({
        role: 'assistant',
        content: m.content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
    } else if (m.role === 'tool') {
      messages.push({ role: 'tool', content: m.content });
    } else {
      messages.push({ role: m.role, content: m.content });
    }
  }
  // '' means "tool-result continuation" (ReasoningRuntime.continueTurn) — the
  // tool message(s) above are what the model responds to, nothing new to add.
  if (request.input) messages.push({ role: 'user', content: request.input });
  return messages;
}

function toOllamaTools(request: ReasoningProviderRequest) {
  if (!request.tools || request.tools.length === 0) return undefined;
  return request.tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    },
  }));
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
          const tools = toOllamaTools(request);
          const res = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: config.model,
              stream: true,
              messages: toOllamaMessages(request),
              ...(tools ? { tools } : {}),
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
                const toolCalls = json.message?.tool_calls as
                  | { function: { name: string; arguments: unknown } }[]
                  | undefined;
                for (const call of toolCalls ?? []) {
                  callbacks.onToolCall?.({
                    id: uuidv4(),
                    name: call.function.name,
                    arguments: call.function.arguments ?? {},
                  });
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
