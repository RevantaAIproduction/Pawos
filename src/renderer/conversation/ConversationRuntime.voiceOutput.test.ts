import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionResult } from '../../shared/actions/ActionTypes';
import type { SpeechRecognitionCallbacks, SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';
import type { ConversationRuntime as ConversationRuntimeType } from './ConversationRuntime';

function createSpeechRecognitionProvider(onStart?: (callbacks: SpeechRecognitionCallbacks) => void): SpeechRecognitionProvider {
  return {
    name: 'test-stt',
    isSupported: () => true,
    start: async (callbacks) => {
      onStart?.(callbacks);
      return { stop: () => callbacks.onEnd?.(), cancel: () => {} };
    },
  };
}

function createSpeechSynthesisProvider(spoken: string[]): TextToSpeechProvider {
  return {
    name: 'test-tts',
    supportsVisemes: false,
    isSupported: () => true,
    speak: async (text) => {
      spoken.push(text);
    },
    stop: () => {},
  };
}

function createReasoningProvider(response: string): ReasoningProvider {
  return {
    id: 'test-reasoning',
    label: 'Test Reasoning',
    isSupported: () => true,
    streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      callbacks.onDelta(response);
      callbacks.onComplete(response);
      return { cancel: () => {} };
    },
  };
}

function createToolCallReasoningProvider(): ReasoningProvider {
  return {
    id: 'test-reasoning',
    label: 'Test Reasoning',
    isSupported: () => true,
    streamResponse(_request: ReasoningProviderRequest, callbacks: ReasoningProviderCallbacks) {
      callbacks.onToolCall?.({
        id: 'tool-1',
        name: 'start_process',
        arguments: {
          command: 'npx create-next-app@latest orbitdesk --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes',
          cwd: 'C:\\Users\\APPLE\\Documents',
          label: 'Build OrbitDesk',
        },
      });
      callbacks.onComplete('');
      return { cancel: () => {} };
    },
  };
}

async function waitForIdle(runtime: ConversationRuntimeType): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    if (runtime.getSnapshot().state === 'idle') return;
    await Promise.resolve();
  }
}

async function createRuntime(response: string, spoken: string[], onStart?: (callbacks: SpeechRecognitionCallbacks) => void) {
  const { ConversationRuntime } = await import('./ConversationRuntime');
  return new ConversationRuntime({
    speechRecognition: createSpeechRecognitionProvider(onStart),
    speechSynthesis: createSpeechSynthesisProvider(spoken),
    reasoningRuntime: new ReasoningRuntime(createReasoningProvider(response)),
  });
}

describe('ConversationRuntime voice output', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  it('does not speak normal replies while Voice Output is off', async () => {
    const spoken: string[] = [];
    const runtime = await createRuntime('I can help with that.', spoken);

    runtime.submitTranscript('hello');
    await waitForIdle(runtime);

    expect(runtime.getSnapshot().voiceOutputEnabled).toBe(false);
    expect(runtime.getSnapshot().speechPlaybackState).toBe('off');
    expect(spoken).toEqual([]);
  });

  it('keeps recognized speech as a reviewable draft until Send is pressed', async () => {
    const spoken: string[] = [];
    let callbacks!: SpeechRecognitionCallbacks;
    const runtime = await createRuntime('This was sent.', spoken, (nextCallbacks) => {
      callbacks = nextCallbacks;
    });

    runtime.startListening();
    callbacks.onFinalTranscript('ignore the beside person and build the project');
    runtime.stopListening();

    expect(runtime.getSnapshot().draftTranscript).toBe('ignore the beside person and build the project');
    expect(runtime.getSnapshot().messages).toEqual([]);

    runtime.submitTranscript(runtime.getSnapshot().draftTranscript);
    await waitForIdle(runtime);

    expect(runtime.getSnapshot().messages.some((message) => message.role === 'user')).toBe(true);
  });

  it('speaks the latest assistant reply only after an explicit speech request', async () => {
    const spoken: string[] = [];
    const runtime = await createRuntime('Open C:\\Users\\APPLE\\Downloads\\PawOS\\src\\renderer\\conversation\\ConversationRuntime.ts', spoken);

    runtime.submitTranscript('show me the file');
    await waitForIdle(runtime);
    runtime.submitTranscript('speak this');
    await waitForIdle(runtime);

    expect(spoken).toEqual(['I referenced ConversationRuntime.ts. The full path is on screen.']);
  });

  it('uses Voice Output mode for future replies without reading raw commands', async () => {
    const spoken: string[] = [];
    const runtime = await createRuntime('Command: npm run build\nBuild passed.', spoken);

    runtime.submitTranscript('turn voice output on');
    runtime.submitTranscript('run a check');
    await waitForIdle(runtime);

    expect(runtime.getSnapshot().voiceOutputEnabled).toBe(true);
    expect(spoken).toEqual(['The production build passed. Full output is available on screen.']);
  });

  it('stops the task card on terminal Coding Runtime entitlement blocks', async () => {
    const spoken: string[] = [];
    const { ConversationRuntime } = await import('./ConversationRuntime');
    const blocked: ActionResult = {
      ok: false,
      reason: 'entitlement-restricted',
      message: 'Your Paw Go plan supports planning and analysis. Coding Runtime execution requires a paid Coding Runtime entitlement.',
    };
    const runtime = new ConversationRuntime({
      speechRecognition: createSpeechRecognitionProvider(),
      speechSynthesis: createSpeechSynthesisProvider(spoken),
      reasoningRuntime: new ReasoningRuntime(createToolCallReasoningProvider()),
      executeAction: async () => blocked,
      describeAction: async () => 'Running Build Project from the approved PROJECT PLAN.',
      reportActionResult: async (_request, result) => (result.ok ? 'Done.' : result.message ?? 'Execution stopped.'),
    });

    runtime.submitTranscript('Build a small SaaS dashboard called OrbitDesk.');
    await waitForIdle(runtime);

    const task = runtime.getSnapshot().messages.find((message) => message.task)?.task;
    expect(runtime.getSnapshot().state).toBe('idle');
    expect(task).toBeDefined();
    expect(task?.status).toBe('stopped');
    expect(task?.endedAt).toEqual(expect.any(Number));
    expect(task?.actions).toHaveLength(1);
    expect(task?.actions[0]?.result).toMatchObject({ ok: false, reason: 'entitlement-restricted' });
  });
});
