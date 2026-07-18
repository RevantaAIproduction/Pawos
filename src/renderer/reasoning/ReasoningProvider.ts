import type {
  ReasoningMessage,
  ReasoningToolCall,
  ReasoningToolDefinition,
} from './ReasoningTypes';

export type ReasoningProviderRequest = {
  systemPrompt: string;
  /** Everything the provider should see before `input` — for a fresh turn, this is prior turns only; for a tool-result continuation (input === ''), this already includes the current turn's user message plus the assistant's tool call(s) and tool result(s), since there's nothing further to append. */
  history: ReasoningMessage[];
  /** The new user input to append after history, or '' for a tool-result continuation — providers must not append a trailing empty user turn when this is ''. */
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
