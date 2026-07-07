import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRuntime } from './ConversationRuntime';
import type { ConversationSnapshot } from './ConversationTypes';
import {
  createBrowserSpeechRecognitionProvider,
  createBrowserSpeechSynthesisProvider,
  createNoopSpeechRecognitionProvider,
  createNoopSpeechSynthesisProvider,
} from './SpeechProviders';
import { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import { createLocalReasoningProvider } from '../reasoning/LocalReasoningProvider';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';

const defaultSystemPrompt =
  'You are the CompanionOS companion. Be helpful, clear, warm, and concise. Keep the conversation grounded in the current user goal.';

export function useConversationController(args?: {
  onStateChange?: (state: ConversationSnapshot['state']) => void;
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

  useEffect(() => {
    const speechRecognitionProvider = createBrowserSpeechRecognitionProvider();
    const speechSynthesisProvider = createBrowserSpeechSynthesisProvider();
    const reasoningRuntime = new ReasoningRuntime(createLocalReasoningProvider(), defaultSystemPrompt);

    runtimeRef.current = new ConversationRuntime({
      speechRecognition: speechRecognitionProvider.isSupported()
        ? speechRecognitionProvider
        : createNoopSpeechRecognitionProvider(),
      speechSynthesis: speechSynthesisProvider.isSupported()
        ? speechSynthesisProvider
        : createNoopSpeechSynthesisProvider(),
      reasoningRuntime,
      onStateChange: (state) => onStateChangeRef.current?.(state),
    });

    const unsubscribe = runtimeRef.current.subscribe(setSnapshot);

    return () => {
      unsubscribe();
      runtimeRef.current?.close();
      runtimeRef.current = null;
    };
  }, []);

  const open = useCallback(() => runtimeRef.current?.open(), []);
  const close = useCallback(() => runtimeRef.current?.close(), []);
  const toggle = useCallback(() => runtimeRef.current?.toggle(), []);
  const cancel = useCallback(() => runtimeRef.current?.cancel(), []);
  const submitTranscript = useCallback((text: string) => runtimeRef.current?.submitTranscript(text), []);
  const speak = useCallback((text: string) => runtimeRef.current?.speak(text), []);

  const setReasoningProvider = useCallback((provider: ReasoningProvider) => {
    runtimeRef.current?.setReasoningProvider(provider);
  }, []);
  const setReasoningSystemPrompt = useCallback((systemPrompt: string) => {
    runtimeRef.current?.setReasoningSystemPrompt(systemPrompt);
  }, []);

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
  };
}
