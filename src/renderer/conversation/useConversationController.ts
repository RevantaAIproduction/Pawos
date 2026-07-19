import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRuntime } from './ConversationRuntime';
import type { ConversationSnapshot } from './ConversationTypes';
import { createSttProvider, createTtsProvider, type TtsProviderConfig } from './SpeechProviderRegistry';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';
import { aiRouter } from '../ai/AIRouter';
import { aiProviderConfigStore } from '../ai/AIProviderConfigStore';
import { useIpcBridge } from '../services/ipc/useIpcBridge';
import type { VisemeFrame } from './LipSyncTypes';
import type { SubmittedInputContext } from './ConversationTypes';
import { PAW_SYSTEM_PROMPT } from './systemPrompt';

export function useConversationController(args?: {
  onStateChange?: (state: ConversationSnapshot['state']) => void;
  onVisemeFrame?: (frame: VisemeFrame) => void;
}) {
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>({
    panelOpen: false,
    state: 'idle',
    messages: [],
    draftTranscript: '',
    errorMessage: null,
    supportsSpeechRecognition: false,
    supportsSpeechSynthesis: false,
  });

  const runtimeRef = useRef<ConversationRuntime | null>(null);
  const onStateChangeRef = useRef(args?.onStateChange);
  onStateChangeRef.current = args?.onStateChange;
  const onVisemeFrameRef = useRef(args?.onVisemeFrame);
  onVisemeFrameRef.current = args?.onVisemeFrame;
  const ipc = useIpcBridge();

  useEffect(() => {
    // Electron's built-in webkitSpeechRecognition ('browser') cannot
    // actually work here — Chromium's speech backend needs a Google API
    // key baked into official Chrome builds, which Electron doesn't have,
    // so it reliably fails with a 'network' error a few seconds in
    // regardless of real connectivity (confirmed directly). STT instead
    // routes recorded audio to Gemini for transcription, reusing the same
    // key already configured for reasoning. TTS still uses the browser —
    // speech *synthesis* works fine in Electron, only recognition doesn't.
    const speechRecognitionProvider = createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini') });
    const speechSynthesisProvider = createTtsProvider({ id: 'browser' });
    const reasoningRuntime = new ReasoningRuntime(aiRouter.getReasoningProvider(), PAW_SYSTEM_PROMPT);

    runtimeRef.current = new ConversationRuntime({
      speechRecognition: speechRecognitionProvider,
      speechSynthesis: speechSynthesisProvider,
      reasoningRuntime,
      onStateChange: (state) => onStateChangeRef.current?.(state),
      executeAction: (request) => ipc.executeAction(request),
      checkActionRequirements: (request) => ipc.checkActionRequirements(request),
      describeAction: (request) => ipc.describeAction(request),
      reportActionResult: (request, result) => ipc.reportActionResult(request, result),
      onProcessOutput: (cb) => ipc.onProcessOutput(cb),
      onProcessExit: (cb) => ipc.onProcessExit(cb),
      onWorkspaceObservation: (cb) => ipc.onWorkspaceObservation(cb),
      onCommunicationEvent: (cb) => ipc.onCommunicationEvent(cb),
      onVisemeFrame: (frame) => onVisemeFrameRef.current?.(frame),
      persistTurn: (turn, hint) => ipc.appendSessionTurn(turn, hint),
      persistExecution: (record) => ipc.recordExecution(record),
      resolveSession: async (transcript) => {
        try {
          const summaries = await ipc.listSessions();
          const candidates = summaries
            .filter((s) => !s.archived)
            .slice(0, 8)
            .map((s) => ({ id: s.id, title: s.title, lastMessage: s.lastMessage }));
          if (candidates.length === 0) return { type: 'auto' as const };

          const decision = await aiRouter.classifySessionContinuation(transcript, candidates);
          if (decision.action === 'continue' && decision.sessionId) {
            return { type: 'continue' as const, sessionId: decision.sessionId };
          }
          if (decision.action === 'new') return { type: 'new' as const };
          return { type: 'auto' as const };
        } catch {
          // Classification failed (no key configured, network error, etc.)
          // — defer to the store's own time-based heuristic rather than
          // blocking the turn on a decision that couldn't be made.
          return { type: 'auto' as const };
        }
      },
    });

    const unsubscribe = runtimeRef.current.subscribe(setSnapshot);

    // Re-point at the newly-configured provider the moment Settings changes
    // it (e.g. the Gemini key finishes loading from .env after this effect
    // already ran) — no restart needed for either reasoning or STT.
    const unsubscribeConfig = aiProviderConfigStore.subscribe(() => {
      runtimeRef.current?.setReasoningProvider(aiRouter.getReasoningProvider());
      runtimeRef.current?.setSpeechRecognitionProvider(
        createSttProvider({ id: 'gemini', apiKey: aiProviderConfigStore.getApiKey('gemini') })
      );
    });

    return () => {
      unsubscribe();
      unsubscribeConfig();
      runtimeRef.current?.close();
      runtimeRef.current = null;
    };
  }, [ipc]);

  const open = useCallback(() => runtimeRef.current?.open(), []);
  const close = useCallback(() => runtimeRef.current?.close(), []);
  const toggle = useCallback(() => runtimeRef.current?.toggle(), []);
  const cancel = useCallback(() => runtimeRef.current?.cancel(), []);
  const submitTranscript = useCallback(
    (text: string, context?: SubmittedInputContext) => runtimeRef.current?.submitTranscript(text, context),
    []
  );
  const speak = useCallback((text: string) => runtimeRef.current?.speak(text), []);

  const setReasoningProvider = useCallback((provider: ReasoningProvider) => {
    runtimeRef.current?.setReasoningProvider(provider);
  }, []);
  const setReasoningSystemPrompt = useCallback((systemPrompt: string) => {
    runtimeRef.current?.setReasoningSystemPrompt(systemPrompt);
  }, []);
  const setSpeechSynthesisProvider = useCallback((config: TtsProviderConfig) => {
    runtimeRef.current?.setSpeechSynthesisProvider(createTtsProvider(config));
  }, []);

  /** "Retry failed step" in a Task Card's Details panel. */
  const retryAction = useCallback(
    (taskId: string, actionId: string) => runtimeRef.current?.retryTaskAction(taskId, actionId),
    []
  );
  /** "Open" a file/folder a Task Card touched — a direct desktop action, outside the conversation/narration pipeline. */
  const openPath = useCallback(
    (path: string, kind: 'file' | 'folder') => {
      void ipc.executeAction(kind === 'folder' ? { type: 'openFolder', path } : { type: 'openFile', path });
    },
    [ipc]
  );

  return {
    snapshot,
    open,
    close,
    toggle,
    cancel,
    submitTranscript,
    speak,
    setReasoningProvider,
    setReasoningSystemPrompt,
    setSpeechSynthesisProvider,
    retryAction,
    openPath,
  };
}
