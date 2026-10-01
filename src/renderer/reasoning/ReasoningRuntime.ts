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
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from './ReasoningProvider';
import type { ProviderUsageMetadata } from '../../shared/billing/UsageMeteringTypes';
import { recentPlainTextHistory } from '../conversation/simpleQuestion';

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
  /** One-line prompt for minimal-path turns (runTurn's `minimal` option). Empty = such turns are sent
   *  exactly like any other turn. */
  private minimalSystemPrompt = '';
  /** This turn's own context (minimal or selected), reused by its continuations; null = full default. */
  private turnOverride: { systemPrompt: string; tools: ReasoningToolDefinition[]; contextPath: NonNullable<ReasoningProviderRequest['contextPath']> } | null = null;
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

  setMinimalSystemPrompt(systemPrompt: string) {
    this.minimalSystemPrompt = systemPrompt;
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

  /** Starts from an earlier conversation (a reopened chat) — plain user/assistant text, oldest first. */
  seedHistory(entries: { role: 'user' | 'assistant'; content: string }[]) {
    this.cancel();
    this.history = entries.filter((e) => e.content.trim()).map((e) => createMessage(e.role, e.content, 'final'));
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
  provideToolResult(result: { toolCallId: string; name: string; content: string; images?: ReasoningMessage['images'] }) {
    this.history = [
      ...this.history,
      createMessage('tool', result.content, 'final', {
        toolCallId: result.toolCallId,
        name: result.name,
        ...(result.images && result.images.length > 0 ? { images: result.images } : {}),
      }),
    ];
  }

  /**
   * `opts.minimal`: a simple factual/general question (see conversation/simpleQuestion.ts) — sent with
   * the one-line minimal prompt and zero tools, plus either no history (`includeHistory: false`, a
   * standalone question) or only the last few plain text messages (a follow-up to a previous plain
   * Q&A). Ignored when no minimal prompt is set. The turn is still recorded in full history.
   */
  runTurn(
    input: string,
    callbacks: ReasoningRuntimeCallbacks = {},
    opts: { minimal?: { includeHistory: boolean }; selected?: { systemPrompt: string; tools: ReasoningToolDefinition[] } } = {}
  ): ReasoningTurnHandle {
    // A new turn starts from the default context; runTurn's options set this turn's own below.
    this.turnOverride = null;
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      const completed = Promise.resolve({
        response: '',
        assistantMessage: null,
        toolCalls: [],
        usage: null,
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

    if (opts.minimal && this.minimalSystemPrompt) {
      const includeHistory = opts.minimal.includeHistory;
      this.turnOverride = { systemPrompt: this.minimalSystemPrompt, tools: [], contextPath: includeHistory ? 'minimal-follow-up' : 'minimal-question' };
      return this.streamAndTrack(includeHistory ? recentPlainTextHistory(priorHistory) : [], trimmedInput, callbacks, this.turnOverride);
    }
    if (opts.selected) {
      // Per-request capability selection: this turn — including every tool-result continuation —
      // uses only these tools and prompt sections (widened via setTurnContext on escalation).
      this.turnOverride = { systemPrompt: opts.selected.systemPrompt, tools: opts.selected.tools, contextPath: 'selected' };
      return this.streamAndTrack(priorHistory, trimmedInput, callbacks, this.turnOverride);
    }
    return this.streamAndTrack(priorHistory, trimmedInput, callbacks);
  }

  /** The current turn's selected context (null = the full default prompt and tools). */
  getTurnContext(): { systemPrompt: string; tools: ReasoningToolDefinition[] } | null {
    return this.turnOverride ? { systemPrompt: this.turnOverride.systemPrompt, tools: [...this.turnOverride.tools] } : null;
  }

  /** Replaces the current turn's selected context — used when the model requests more capabilities
   *  mid-turn; the next continueTurn() uses it. No effect on a full-context turn. */
  setTurnContext(context: { systemPrompt: string; tools: ReasoningToolDefinition[] }): void {
    if (!this.turnOverride || this.turnOverride.contextPath !== 'selected') return;
    this.turnOverride = { ...this.turnOverride, systemPrompt: context.systemPrompt, tools: [...context.tools] };
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
    // A continuation keeps its turn's selected tools/prompt, so a tool result is always interpreted
    // with the same (or a widened) tool set — never the minimal path's history-less view, though:
    // minimal turns carry no tools and therefore never continue.
    if (this.turnOverride && this.turnOverride.contextPath === 'selected') {
      return this.streamAndTrack(this.getHistory(), '', callbacks, this.turnOverride);
    }
    return this.streamAndTrack(this.getHistory(), '', callbacks);
  }

  /** Shared by runTurn (input = new user text, history = prior turns) and continueTurn (input = '', history = everything up to and including the just-recorded tool result). */
  private streamAndTrack(
    historyForRequest: ReasoningMessage[],
    input: string,
    callbacks: ReasoningRuntimeCallbacks,
    override?: { systemPrompt: string; tools: ReasoningToolDefinition[]; contextPath: ReasoningProviderRequest['contextPath'] }
  ): ReasoningTurnHandle {
    const turnId = ++this.activeTurnId;
    const toolCalls: ReasoningToolCall[] = [];
    let response = '';
    let assistantMessage: ReasoningMessage | null = null;
    let usage: ProviderUsageMetadata | null = null;
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

    // Outer watchdog timeout (185s). The provider has a 180s idle timeout.
    // This watchdog ensures that if the provider entirely fails to clean up,
    // the turn won't hang indefinitely, but it will never race the provider's own timeout.
    const timeoutHandle = setTimeout(() => {
      if (!settled) {
        settleRejected(new Error('Response generation timeout'));
      }
    }, 185000);



    try {
      this.activeTurnReject = settleRejected;
      this.activeSession = this.provider.streamResponse(
        {
          systemPrompt: override ? override.systemPrompt : this.systemPrompt,
          history: historyForRequest,
          input,
          tools: override ? override.tools : this.getTools(),
          contextPath: override ? override.contextPath : 'full',
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
          onUsage: (reportedUsage) => {
            if (this.activeTurnId !== turnId) return;
            // A streaming response may report cumulative usage more than once (Gemini's chunk-by-chunk
            // usageMetadata, Anthropic's message_start + message_delta) — the last call before
            // onComplete carries the authoritative final totals, so simply overwriting is correct.
            usage = reportedUsage;
          },
          onComplete: (providerResponse) => {
            clearTimeout(timeoutHandle);
            if (this.activeTurnId !== turnId) {
              if (!settled) {
                // Response arrived but for an old turn - still settle it to avoid hanging
                settleResolved({ response: '', assistantMessage: createMessage('assistant', '', 'final'), toolCalls: [], usage });
              }
              return;
            }
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
            // A tool can finish while its response is still streaming, so its result may already be in
            // history ahead of the message that asked for it — every result must follow its call.
            if (toolCallsForMessage) {
              const ids = new Set(toolCallsForMessage.map((call) => call.id));
              const early = this.history.filter((m) => m.role === 'tool' && m.toolCallId !== undefined && ids.has(m.toolCallId) && this.history.indexOf(m) < this.history.indexOf(assistantMessage!));
              if (early.length > 0) {
                const rest = this.history.filter((m) => !early.includes(m));
                const at = rest.indexOf(assistantMessage) + 1;
                this.history = [...rest.slice(0, at), ...early, ...rest.slice(at)];
              }
            }

            const result = {
              response,
              assistantMessage,
              toolCalls: [...toolCalls],
              usage,
            };
            callbacks.onComplete?.(result);
            settleResolved(result);
          },
          onError: (error) => {
            clearTimeout(timeoutHandle);
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
