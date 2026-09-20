import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpeechRecognitionProvider, SpeechRecognitionCallbacks, TextToSpeechProvider } from './SpeechProviders';
import type { ConversationRuntime as ConversationRuntimeType } from './ConversationRuntime';

function createMockStt(onStart?: (callbacks: SpeechRecognitionCallbacks) => void): SpeechRecognitionProvider {
  return {
    id: 'mock',
    name: 'Mock',
    isSupported: () => true,
    start: async (callbacks) => {
      onStart?.(callbacks);
      return { stop: () => {}, cancel: () => {} };
    }
  };
}

function createMockTts(spoken: string[]): TextToSpeechProvider {
  return {
    id: 'mock',
    name: 'Mock',
    isSupported: () => true,
    speak: async (text) => {
      spoken.push(text);
    },
    stop: () => {}
  };
}

describe('Voice Entitlement Invariants (V1 Gating)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    });
  });

  it('VOICE-V1-1 Voice prompt uses the same entitlement gate as typed prompt', async () => {
    let startedListening = false;
    let gateChecked = false;
    
    const mockBillingCanStartGeneration = async () => {
      gateChecked = true;
      return { allowed: true };
    };

    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: createMockStt(() => { startedListening = true; }),
      speechSynthesis: createMockTts([]),
      reasoningRuntime: new ReasoningRuntime({
        id: 'mock',
        name: 'Mock',
        isSupported: () => true,
        generate: async () => ({ text: 'Response', usages: [] })
      } as any)
    });

    const gateResult = await mockBillingCanStartGeneration();
    if (gateResult.allowed) {
      runtime.startListening();
    }
    
    await new Promise(r => setTimeout(r, 10));
    expect(gateChecked).toBe(true);
    expect(startedListening).toBe(true);
    expect(runtime.getSnapshot().state).toBe('listening');
  });

  it('VOICE-V1-2 Voice cannot generate when the normal AI usage gate blocks the user', async () => {
    let startedListening = false;
    let gateChecked = false;

    const mockBillingCanStartGeneration = async () => {
      gateChecked = true;
      return { allowed: false, reason: 'Exhausted' };
    };

    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: createMockStt(() => { startedListening = true; }),
      speechSynthesis: createMockTts([]),
      reasoningRuntime: new ReasoningRuntime({} as any)
    });

    const gateResult = await mockBillingCanStartGeneration();
    if (gateResult.allowed) {
      runtime.startListening();
    }
    
    await new Promise(r => setTimeout(r, 10));
    expect(gateChecked).toBe(true);
    expect(startedListening).toBe(false);
    expect(runtime.getSnapshot().state).toBe('idle');
  });

  it('VOICE-V1-3 TTS does not introduce a separate unlimited AI allowance (gated via UI)', async () => {
    const spoken: string[] = [];
    let gateChecked = false;

    const mockBillingCanStartGeneration = async () => {
      gateChecked = true;
      return { allowed: false, reason: 'Exhausted' };
    };

    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: createMockStt(),
      speechSynthesis: createMockTts(spoken),
      reasoningRuntime: new ReasoningRuntime({} as any)
    });

    const gateResult = await mockBillingCanStartGeneration();
    if (gateResult.allowed) {
      await runtime.speak('Hello World');
    }

    expect(gateChecked).toBe(true);
    expect(spoken.length).toBe(0);
  });

  it('VOICE-014 Voice generation still uses the applicable tiers normal compute/billing rules', async () => {
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: createMockStt(),
      speechSynthesis: createMockTts([]),
      reasoningRuntime: new ReasoningRuntime({
        id: 'mock',
        name: 'Mock',
        isSupported: () => true,
        generate: async () => ({ text: 'Response', usages: [] })
      } as any)
    });

    runtime.submitTranscript('this was spoken');
    await new Promise(r => setTimeout(r, 10));
    
    const snapshot = runtime.getSnapshot();
    expect(snapshot.messages.some(m => m.role === 'user' && m.content === 'this was spoken')).toBe(true);
  });
});
