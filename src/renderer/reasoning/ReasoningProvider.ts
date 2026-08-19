import type {
  ReasoningMessage,
  ReasoningToolCall,
  ReasoningToolDefinition,
} from './ReasoningTypes';
import type { ProviderUsageMetadata } from '../../shared/billing/UsageMeteringTypes';

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
  /**
   * Real, provider-reported usage for this request — called whenever the provider's own response
   * actually carries usage metadata (may fire more than once as a streaming response accumulates
   * cumulative totals; the last call before onComplete is authoritative). Never called with an
   * estimated/guessed value — a provider that returns no usage data simply never calls this.
   */
  onUsage?: (usage: ProviderUsageMetadata) => void;
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
