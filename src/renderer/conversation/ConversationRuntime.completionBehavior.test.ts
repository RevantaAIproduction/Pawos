import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ReasoningProvider, ReasoningProviderCallbacks, ReasoningProviderRequest } from '../reasoning/ReasoningProvider';
import type { ActionRequest, ActionResult } from '../../shared/actions/ActionTypes';

const stt = { name: 'test', isSupported: () => true, start: async () => ({ stop: () => {}, cancel: () => {} }) };
const tts = { name: 'test', supportsVisemes: false, isSupported: () => true, speak: async () => {}, stop: () => {} };

describe('ConversationRuntime Completion & Error Recovery Behavior', () => {
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

  it('does not immediately mark task COMPLETED on recoverable error, allows loop, reaches COMPLETED on success', async () => {
    let callCount = 0;
    const mockProvider: ReasoningProvider = {
      id: 'mock',
      label: 'Mock',
      isSupported: () => true,
      streamResponse(request: ReasoningProviderRequest, callbacks?: ReasoningProviderCallbacks) {
        callCount++;
        if (callCount === 1) {
          setTimeout(() => {
            callbacks?.onToolCall?.({
              id: 'call_1',
              name: 'run_command',
              arguments: { command: 'npm run build' }
            });
            callbacks?.onEnd?.('assistant', { text: '', usages: [] });
          }, 0);
          return { cancel: () => {} } as any;
        }
        if (callCount === 2) {
          setTimeout(() => {
            callbacks?.onToolCall?.({
              id: 'call_2',
              name: 'run_command',
              arguments: { command: 'npm run build' }
            });
            callbacks?.onEnd?.('assistant', { text: '', usages: [] });
          }, 0);
          return { cancel: () => {} } as any;
        }
        setTimeout(() => {
          callbacks?.onDelta?.('Home page added successfully. Status: Completed');
          callbacks?.onEnd?.('assistant', { text: 'Home page added successfully. Status: Completed', usages: [] });
        }, 0);
        return { cancel: () => {} } as any;
      }
    };

    const { ConversationRuntime } = await import('./ConversationRuntime');
    const { ReasoningRuntime } = await import('../reasoning/ReasoningRuntime');

    const runtime = new ConversationRuntime({
      speechRecognition: stt as any,
      speechSynthesis: tts as any,
      reasoningRuntime: new ReasoningRuntime(mockProvider),
      executeAction: async (req: ActionRequest): Promise<ActionResult> => {
        if (req.type === 'run_command') {
          if (callCount === 1) {
            return { ok: false, data: { exitCode: 1, stdout: '', stderr: 'Build failed' } };
          }
          return { ok: true, data: { exitCode: 0, stdout: 'Build passed', stderr: '' } };
        }
        return { ok: true, data: {} };
      }
    });

    runtime.submitTranscript('Add a home page.');
    await new Promise(r => setTimeout(r, 100));
    
    const snapshot = runtime.getSnapshot();
    expect(snapshot.state).toBe('idle');
    expect(callCount).toBe(3);
    
    const log = runtime.getConversationLog();
    const lastTurn = log[log.length - 1];
    
    expect(lastTurn.endedReason).toBe('completed');
    expect(lastTurn.assistantResponse).toContain('Status: Completed');
    expect(lastTurn.actionsExecuted.length).toBe(2);
    expect(lastTurn.actionsExecuted[0].ok).toBe(false);
    expect(lastTurn.actionsExecuted[1].ok).toBe(true);
  });
});
