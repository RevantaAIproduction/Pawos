import type {
  ReasoningProvider,
  ReasoningProviderCallbacks,
  ReasoningProviderRequest,
  ReasoningProviderSession,
} from './ReasoningProvider';

const chunkDelayMs = 30;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function normalize(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function extractTopic(history: ReasoningProviderRequest['history']) {
  const recentUserMessage = [...history].reverse().find((message) => message.role === 'user');
  return recentUserMessage?.content?.trim() ?? '';
}

function buildLocalReply(request: ReasoningProviderRequest) {
  const input = normalize(request.input);
  const topic = extractTopic(request.history);
  const prompt = request.systemPrompt.toLowerCase();
  const warmTone = prompt.includes('warm') || prompt.includes('friendly') || prompt.includes('empathetic');
  const conciseTone = prompt.includes('concise') || prompt.includes('brief');

  if (!input) {
    return warmTone ? 'I’m here whenever you’re ready.' : 'I am ready.';
  }

  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/i.test(input)) {
    return warmTone
      ? 'Hi. I’m here with you — tell me what you want to work on.'
      : 'Hello. What would you like to work on?';
  }

  if (/\b(thanks|thank you)\b/i.test(input)) {
    return warmTone ? 'You’re welcome. I’m glad to help.' : 'You are welcome.';
  }

  if (/\b(help|what can you do|how do you work)\b/i.test(input)) {
    return warmTone
      ? 'I can listen, think through what you need, and keep the conversation moving. If you want, tell me the goal and I’ll stay on it.'
      : 'I can listen, think, and respond to your goal.';
  }

  if (topic && input.length < 80) {
    return warmTone
      ? `I’m keeping your earlier note about ${topic}. For this part, I think: ${input}.`
      : `Noted. Regarding ${topic}, I think: ${input}.`;
  }

  if (conciseTone) {
    return `Understood: ${input}`;
  }

  return warmTone
    ? `I’m with you. You said: ${input}. I’ll keep that in context as we continue.`
    : `I heard: ${input}.`;
}

export function createLocalReasoningProvider(): ReasoningProvider {
  return {
    id: 'local-reasoning-provider',
    label: 'Local reasoning',
    isSupported() {
      return typeof window !== 'undefined';
    },
    streamResponse(request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks): ReasoningProviderSession {
      callbacks.onStart?.();

      let cancelled = false;
      const response = buildLocalReply(request);
      const tokens = response.split(/(\s+)/).filter(Boolean);

      void (async () => {
        try {
          for (const token of tokens) {
            if (cancelled) {
              return;
            }
            callbacks.onDelta(token);
            await delay(chunkDelayMs);
          }

          if (!cancelled) {
            callbacks.onComplete(response);
          }
        } catch (error) {
          if (!cancelled) {
            callbacks.onError(error instanceof Error ? error : new Error('Reasoning failed.'));
          }
        }
      })();

      return {
        cancel: () => {
          cancelled = true;
        },
      };
    },
  };
}
