import type { ReasoningProvider } from './ReasoningProvider';
import { createLocalReasoningProvider } from './LocalReasoningProvider';
import { createOpenAiReasoningProvider } from './providers/OpenAiReasoningProvider';
import { createAnthropicReasoningProvider } from './providers/AnthropicReasoningProvider';
import { createGeminiReasoningProvider } from './providers/GeminiReasoningProvider';
import { createOllamaReasoningProvider } from './providers/OllamaReasoningProvider';
import {
  createLmStudioReasoningProvider,
  createOpenRouterReasoningProvider,
} from './providers/OpenAiCompatibleReasoningProvider';

export type ReasoningProviderId =
  | 'local'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'openrouter'
  | 'lm-studio';

export type ReasoningProviderConfig = {
  id: ReasoningProviderId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

/**
 * Builds a ReasoningProvider from a config descriptor. Every provider here
 * implements the same ReasoningProvider interface, so the ConversationRuntime
 * and renderer never need to know which one is active — switching providers
 * is purely a config change, never a code change.
 */
export function createReasoningProvider(config: ReasoningProviderConfig): ReasoningProvider {
  switch (config.id) {
    case 'openai':
      return createOpenAiReasoningProvider({ apiKey: config.apiKey ?? '', model: config.model, baseUrl: config.baseUrl });
    case 'anthropic':
      return createAnthropicReasoningProvider({ apiKey: config.apiKey ?? '', model: config.model, baseUrl: config.baseUrl });
    case 'gemini':
      return createGeminiReasoningProvider({ apiKey: config.apiKey ?? '', model: config.model, baseUrl: config.baseUrl });
    case 'ollama':
      return createOllamaReasoningProvider({ model: config.model ?? 'llama3.2', baseUrl: config.baseUrl });
    case 'openrouter':
      return createOpenRouterReasoningProvider({ apiKey: config.apiKey ?? '', model: config.model });
    case 'lm-studio':
      return createLmStudioReasoningProvider({ model: config.model ?? 'local-model', baseUrl: config.baseUrl });
    case 'local':
    default:
      return createLocalReasoningProvider();
  }
}

export const REASONING_PROVIDER_CATALOG: { id: ReasoningProviderId; label: string; requiresApiKey: boolean }[] = [
  { id: 'local', label: 'Local (offline fallback)', requiresApiKey: false },
  { id: 'openai', label: 'OpenAI', requiresApiKey: true },
  { id: 'anthropic', label: 'Anthropic', requiresApiKey: true },
  { id: 'gemini', label: 'Gemini', requiresApiKey: true },
  { id: 'ollama', label: 'Ollama (local)', requiresApiKey: false },
  { id: 'lm-studio', label: 'LM Studio (local)', requiresApiKey: false },
  { id: 'openrouter', label: 'OpenRouter', requiresApiKey: true },
];
