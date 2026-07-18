export type ReasoningRole = 'system' | 'user' | 'assistant' | 'tool';

export type ReasoningMessageStatus = 'final' | 'streaming';

export type ReasoningMessage = {
  id: string;
  role: ReasoningRole;
  content: string;
  createdAt: number;
  status: ReasoningMessageStatus;
  /** Set on a 'tool' message — which tool call this is the result of, and its name (the provider needs both to pair a function response with the model's own preceding function call). */
  toolCallId?: string;
  name?: string;
  /** Set on an 'assistant' message that made tool calls — replayed into the next provider request so the model's own prior function call is present before the matching function-response message. */
  toolCalls?: ReasoningToolCall[];
};

export type ReasoningToolDefinition = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type ReasoningToolCall = {
  id: string;
  name: string;
  arguments: unknown;
  /**
   * Gemini's "thinking" models (e.g. gemini-flash-latest) attach an opaque
   * signature to each functionCall part encoding the model's internal
   * reasoning state. Replaying a functionCall back to the model (as part of
   * a tool-result continuation) WITHOUT this signature is rejected outright
   * with a 400 ("missing a thought_signature") — so it has to be captured
   * from the original response and threaded back through verbatim. Other
   * providers never set this; it's optional and provider-specific.
   */
  thoughtSignature?: string;
};

export type ReasoningTurnResult = {
  response: string;
  assistantMessage: ReasoningMessage | null;
  toolCalls: ReasoningToolCall[];
};
