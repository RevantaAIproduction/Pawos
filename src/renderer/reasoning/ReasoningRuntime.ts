import { v4 as uuidv4 } from 'uuid';
import type {
  ReasoningMessage,
  ReasoningToolDefinition,
  ReasoningToolCall,
  ReasoningTurnResult,
} from './ReasoningTypes';
import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderSession,
} from './ReasoningProvider';

export type ReasoningRuntimeCallbacks = {
  onStart?: () => void;
  onDelta?: (delta: string, assistantMessage: ReasoningMessage) => void;
  onToolCall?: (toolCall: ReasoningToolCall) => void;
  onComplete?: (result: ReasoningTurnResult) => void;
  onError?: (error: Error) => void;
};

export type ReasoningTurnHandle = {
  cancel: () => void;
  completed: Promise<ReasoningTurnResult>;
};

function createMessage(
  role: ReasoningMessage['role'],
  content: string,
  status: ReasoningMessage['status'],
  extras: Partial<ReasoningMessage> = {}
): ReasoningMessage {
  return {
    id: uuidv4(),
    role,
    content,
    createdAt: Date.now(),
    status,
    ...extras,
  };
}

export class ReasoningRuntime {
  private provider: ReasoningProvider;
  private systemPrompt = '';
  private tools: ReasoningToolDefinition[] = [];
  private history: ReasoningMessage[] = [];
  private activeSession: ReasoningProviderSession | null = null;
  private activeTurnReject: ((error: Error) => void) | null = null;
  private activeTurnId = 0;

  constructor(provider: ReasoningProvider, systemPrompt = '') {
    this.provider = provider;
    this.systemPrompt = systemPrompt;
  }

  getProvider() {
    return this.provider;
  }

  setProvider(provider: ReasoningProvider) {
    if (this.provider.id === provider.id) {
      this.provider = provider;
      return;
    }

    this.cancel();
    this.provider = provider;
  }

  getSystemPrompt() {
    return this.systemPrompt;
  }

  setSystemPrompt(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
  }

  getTools() {
    return [...this.tools];
  }

  setTools(tools: ReasoningToolDefinition[]) {
    this.tools = [...tools];
  }

  getHistory() {
    return [...this.history];
  }

  resetHistory() {
    this.cancel();
    this.history = [];
  }

  cancel() {
    const reject = this.activeTurnReject;
    this.activeTurnId += 1;
    this.activeSession?.cancel();
    this.activeSession = null;
    this.activeTurnReject = null;
    reject?.(new Error('Reasoning cancelled.'));
  }

  appendSystemMessage(content: string) {
    this.history = [...this.history, createMessage('system', content, 'final')];
  }

  /**
   * Feeds an executed tool's real result back into history as a 'tool'-role
   * message — content should be the full result (e.g. JSON.stringify of the
   * ActionResult), not the short human-facing narration. Call continueTurn()
   * afterward to let the model actually react to it; this method only
   * records the result, it doesn't invoke the provider itself.
   */
  provideToolResult(result: { toolCallId: string; name: string; content: string }) {
    this.history = [
      ...this.history,
      createMessage('tool', result.content, 'final', { toolCallId: result.toolCallId, name: result.name }),
    ];
  }

  runTurn(input: string, callbacks: ReasoningRuntimeCallbacks = {}): ReasoningTurnHandle {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      const completed = Promise.resolve({
        response: '',
        assistantMessage: null,
        toolCalls: [],
      });
      return {
        cancel: () => {
          this.cancel();
        },
        completed,
      };
    }

    // Captured before appending — every provider's request builder treats
    // `history` as prior turns only and appends `input` as the new one, so
    // passing history that already includes this turn would duplicate it
    // as two consecutive user turns in the same request.
    const priorHistory = this.getHistory();
    const userMessage = createMessage('user', trimmedInput, 'final');
    this.history = [...this.history, userMessage];

    return this.streamAndTrack(priorHistory, trimmedInput, callbacks);
  }

  /**
   * Continues the CURRENT turn after a tool result has been recorded via
   * provideToolResult() — no new user input, just lets the model react to
   * what's already in history (its own prior tool call plus the tool's real
   * result). This is what makes "run command → see the real error → fix →
   * retry" possible within a single turn instead of the model never
   * learning whether its own tool call actually worked.
   */
  continueTurn(callbacks: ReasoningRuntimeCallbacks = {}): ReasoningTurnHandle {
    return this.streamAndTrack(this.getHistory(), '', callbacks);
  }

  /** Shared by runTurn (input = new user text, history = prior turns) and continueTurn (input = '', history = everything up to and including the just-recorded tool result). */
  private streamAndTrack(
    historyForRequest: ReasoningMessage[],
    input: string,
    callbacks: ReasoningRuntimeCallbacks
  ): ReasoningTurnHandle {
    const turnId = ++this.activeTurnId;
    const toolCalls: ReasoningToolCall[] = [];
    let response = '';
    let assistantMessage: ReasoningMessage | null = null;
    let resolveCompleted!: (result: ReasoningTurnResult) => void;
    let rejectCompleted!: (error: Error) => void;
    let settled = false;

    const completed = new Promise<ReasoningTurnResult>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    const settleResolved = (result: ReasoningTurnResult) => {
      if (settled) return;
      settled = true;
      this.activeSession = null;
      this.activeTurnReject = null;
      resolveCompleted(result);
    };

    const settleRejected = (error: Error) => {
      if (settled) return;
      settled = true;
      this.activeSession = null;
      this.activeTurnReject = null;
      rejectCompleted(error);
    };

    try {
      this.activeTurnReject = settleRejected;
      this.activeSession = this.provider.streamResponse(
        {
          systemPrompt: this.systemPrompt,
          history: historyForRequest,
          input,
          tools: this.getTools(),
        },
        {
          onStart: () => {
            if (this.activeTurnId !== turnId) return;
            callbacks.onStart?.();
          },
          onDelta: (delta) => {
            if (this.activeTurnId !== turnId) return;
            response += delta;
            if (!assistantMessage) {
              assistantMessage = createMessage('assistant', response, 'streaming');
              this.history = [...this.history, assistantMessage];
            } else {
              assistantMessage = {
                ...assistantMessage,
                content: response,
              };
              this.history = this.history.map((message) =>
                message.id === assistantMessage?.id ? assistantMessage! : message
              );
            }

            callbacks.onDelta?.(delta, assistantMessage);
          },
          onToolCall: (toolCall) => {
            if (this.activeTurnId !== turnId) return;
            toolCalls.push(toolCall);
            callbacks.onToolCall?.(toolCall);
          },
          onComplete: (providerResponse) => {
            if (this.activeTurnId !== turnId) return;
            response = providerResponse || response;
            const toolCallsForMessage = toolCalls.length > 0 ? [...toolCalls] : undefined;
            if (assistantMessage) {
              assistantMessage = {
                ...assistantMessage,
                status: 'final',
                content: response,
                toolCalls: toolCallsForMessage,
              };
              this.history = this.history.map((message) =>
                message.id === assistantMessage?.id ? assistantMessage! : message
              );
            } else {
              assistantMessage = createMessage('assistant', response, 'final', { toolCalls: toolCallsForMessage });
              this.history = [...this.history, assistantMessage];
            }

            const result = {
              response,
              assistantMessage,
              toolCalls: [...toolCalls],
            };
            callbacks.onComplete?.(result);
            settleResolved(result);
          },
          onError: (error) => {
            if (this.activeTurnId !== turnId) return;
            callbacks.onError?.(error);
            settleRejected(error);
          },
        } satisfies ReasoningProviderCallbacks
      );
    } catch (error) {
      const runtimeError = error instanceof Error ? error : new Error('Reasoning failed.');
      callbacks.onError?.(runtimeError);
      settleRejected(runtimeError);
    }

    return {
      cancel: () => {
        this.cancel();
      },
      completed,
    };
  }
}
