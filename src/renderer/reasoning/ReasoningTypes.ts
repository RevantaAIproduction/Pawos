export type ReasoningRole = 'system' | 'user' | 'assistant' | 'tool';

export type ReasoningMessageStatus = 'final' | 'streaming';

export type ReasoningMessage = {
  id: string;
  role: ReasoningRole;
  content: string;
  createdAt: number;
  status: ReasoningMessageStatus;
  toolCallId?: string;
  name?: string;
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
};

export type ReasoningTurnResult = {
  response: string;
  assistantMessage: ReasoningMessage | null;
  toolCalls: ReasoningToolCall[];
};
