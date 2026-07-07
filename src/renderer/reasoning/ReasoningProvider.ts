import type {
  ReasoningMessage,
  ReasoningToolCall,
  ReasoningToolDefinition,
} from './ReasoningTypes';

export type ReasoningProviderRequest = {
  systemPrompt: string;
  history: ReasoningMessage[];
  input: string;
  tools: ReasoningToolDefinition[];
};

export type ReasoningProviderCallbacks = {
  onStart?: () => void;
  onDelta: (delta: string) => void;
  onToolCall?: (toolCall: ReasoningToolCall) => void;
  onComplete: (response: string) => void;
  onError: (error: Error) => void;
};

export type ReasoningProviderSession = {
  cancel: () => void;
};

export interface ReasoningProvider {
  readonly id: string;
  readonly label: string;
  isSupported(): boolean;
  streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession;
}
