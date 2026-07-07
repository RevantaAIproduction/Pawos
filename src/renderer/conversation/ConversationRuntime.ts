import { v4 as uuidv4 } from 'uuid';
import type {
  ConversationMessage,
  ConversationSnapshot,
  ConversationState,
} from './ConversationTypes';
import type {
  SpeechRecognitionProvider,
  TextToSpeechProvider,
} from './SpeechProviders';
import type { ReasoningRuntime } from '../reasoning/ReasoningRuntime';
import type { ReasoningTurnHandle } from '../reasoning/ReasoningRuntime';
import type { ReasoningProvider } from '../reasoning/ReasoningProvider';

const turnDelayMs = 180;

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildDefaultResponse(transcript: string) {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return 'I did not catch that.';
  }

  return `I heard: ${trimmed}`;
}

export class ConversationRuntime {
  private snapshot: ConversationSnapshot;
  private listeners = new Set<(snapshot: ConversationSnapshot) => void>();
  private recognitionSession: { stop: () => void; cancel: () => void } | null = null;
  private reasoningTurn: ReasoningTurnHandle | null = null;
  private turnId = 0;
  private closed = true;

  constructor(
    private args: {
      speechRecognition: SpeechRecognitionProvider;
      speechSynthesis: TextToSpeechProvider;
      reasoningRuntime: ReasoningRuntime;
      onStateChange?: (state: ConversationState) => void;
    }
  ) {
    this.snapshot = {
      panelOpen: false,
      state: 'idle',
      messages: [],
      draftTranscript: '',
      errorMessage: null,
      supportsSpeechRecognition: args.speechRecognition.isSupported(),
      supportsSpeechSynthesis: args.speechSynthesis.isSupported(),
    };
  }

  subscribe(listener: (snapshot: ConversationSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot() {
    return this.snapshot;
  }

  setReasoningProvider(provider: ReasoningProvider) {
    this.args.reasoningRuntime.setProvider(provider);
  }

  setReasoningSystemPrompt(systemPrompt: string) {
    this.args.reasoningRuntime.setSystemPrompt(systemPrompt);
  }

  open() {
    this.closed = false;
    if (['listening', 'transcribing', 'thinking', 'speaking'].includes(this.snapshot.state)) {
      this.updateSnapshot({ panelOpen: true });
      return;
    }

    this.updateSnapshot({
      panelOpen: true,
      errorMessage: null,
    });
    void this.beginListening();
  }

  /**
   * Speak text without starting speech recognition or modifying conversation history.
   * Intended for first-launch/UX announcements.
   */
  async speak(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Ensure we don’t accidentally run reasoning or STT.
    this.args.speechSynthesis.stop();
    this.updateSnapshot({
      // keep panel open state unchanged; only reflect speaking state
      state: 'speaking',
      errorMessage: null,
      draftTranscript: '',
    });

    try {
      await this.args.speechSynthesis.speak(trimmed);
    } catch (error) {
      this.failTurn(error instanceof Error ? error.message : 'Speech synthesis failed.');
      return;
    }

    if (this.closed) {
      return;
    }

    this.reasoningTurn = null;
    this.updateSnapshot({
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }


  close() {
    this.closed = true;
    this.turnId += 1;
    this.stopRecognition();
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.args.speechSynthesis.stop();
    this.updateSnapshot({
      panelOpen: false,
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }

  toggle() {
    if (this.snapshot.panelOpen) {
      this.close();
      return;
    }

    this.open();
  }

  submitTranscript(transcript: string) {
    const trimmed = transcript.trim();
    if (!trimmed || this.snapshot.state === 'speaking') {
      return;
    }

    this.closed = false;
    if (this.snapshot.state !== 'listening') {
      this.updateSnapshot({
        state: 'listening',
        errorMessage: null,
      });
    }
    this.appendMessage('user', trimmed);
    void this.handleTranscript(trimmed);
  }

  cancel() {
    this.turnId += 1;
    this.stopRecognition();
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.args.speechSynthesis.stop();
    this.updateSnapshot({
      state: 'idle',
      draftTranscript: '',
      errorMessage: null,
    });
  }

  private async beginListening() {
    if (this.closed) {
      return;
    }

    if (!this.args.speechRecognition.isSupported()) {
      this.updateSnapshot({
        state: 'waitingForPermission',
        errorMessage: null,
      });
      return;
    }

    this.updateSnapshot({
      state: 'listening',
      draftTranscript: '',
      errorMessage: null,
    });

    const currentTurn = ++this.turnId;
    try {
      this.recognitionSession = await this.args.speechRecognition.start({
        onPartialTranscript: (text) => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.updateSnapshot({ draftTranscript: text });
        },
        onFinalTranscript: (text) => {
          if (this.closed || currentTurn !== this.turnId) return;
          const finalTranscript = text.trim();
          if (!finalTranscript) {
            return;
          }
          this.appendMessage('user', finalTranscript);
          void this.handleTranscript(finalTranscript);
        },
        onPermissionDenied: () => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.updateSnapshot({
            state: 'waitingForPermission',
            errorMessage: 'Speech recognition permission is required.',
          });
        },
        onEnd: () => {
          if (this.closed || currentTurn !== this.turnId) return;
          if (this.snapshot.state === 'listening') {
            this.updateSnapshot({
              state: 'idle',
              draftTranscript: '',
            });
          }
        },
        onError: (error) => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.failTurn(error.message);
        },
      });
    } catch (error) {
      this.failTurn(error instanceof Error ? error.message : 'Speech recognition failed.');
    }
  }

  private stopRecognition() {
    this.recognitionSession?.cancel();
    this.recognitionSession = null;
  }

  private async handleTranscript(transcript: string) {
    if (this.closed) {
      return;
    }

    const currentTurn = ++this.turnId;
    this.stopRecognition();

    this.updateSnapshot({
      state: 'transcribing',
      draftTranscript: transcript,
      errorMessage: null,
    });

    await delay(turnDelayMs);
    if (this.closed || currentTurn !== this.turnId) {
      return;
    }

    this.updateSnapshot({
      state: 'thinking',
      errorMessage: null,
    });

    await delay(turnDelayMs);
    if (this.closed || currentTurn !== this.turnId) {
      return;
    }

    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;

    let finalResponse = '';
    let turnFailed = false;
    let turnHandle: ReasoningTurnHandle;

    try {
      turnHandle = this.args.reasoningRuntime.runTurn(transcript, {
        onDelta: (_delta, assistantMessage) => {
          if (this.closed || currentTurn !== this.turnId) return;
          this.upsertMessage({
            id: assistantMessage.id,
            role: 'assistant',
            content: assistantMessage.content,
            createdAt: assistantMessage.createdAt,
            status: assistantMessage.status,
          });
        },
        onComplete: (result) => {
          if (this.closed || currentTurn !== this.turnId) return;
          finalResponse = result.response || result.assistantMessage?.content || '';
          if (result.assistantMessage) {
            this.upsertMessage({
              id: result.assistantMessage.id,
              role: 'assistant',
              content: result.assistantMessage.content,
              createdAt: result.assistantMessage.createdAt,
              status: 'final',
            });
          }
        },
        onError: (error) => {
          if (this.closed || currentTurn !== this.turnId) return;
          turnFailed = true;
          this.failTurn(error.message);
        },
      });
      this.reasoningTurn = turnHandle;

      const result = await turnHandle.completed;
      finalResponse = result.response || result.assistantMessage?.content || finalResponse;
    } catch (error) {
      if (this.closed || currentTurn !== this.turnId || turnFailed) {
        return;
      }
      this.failTurn(error instanceof Error ? error.message : 'Failed to compose a response.');
      return;
    }

    if (this.closed || currentTurn !== this.turnId) {
      return;
    }

    if (!finalResponse) {
      finalResponse = buildDefaultResponse(transcript);
    }

    this.updateSnapshot({
      state: 'speaking',
      draftTranscript: '',
    });

    try {
      await this.args.speechSynthesis.speak(finalResponse);
    } catch (error) {
      this.failTurn(error instanceof Error ? error.message : 'Speech synthesis failed.');
      return;
    }

    if (this.closed || currentTurn !== this.turnId) {
      return;
    }

    this.reasoningTurn = null;
    this.updateSnapshot({
      state: 'idle',
      draftTranscript: '',
    });
  }

  private failTurn(message: string) {
    this.reasoningTurn?.cancel();
    this.reasoningTurn = null;
    this.args.speechSynthesis.stop();
    this.updateSnapshot({
      state: 'error',
      errorMessage: message,
    });
  }

  private appendMessage(role: 'system' | 'user' | 'assistant', content: string, status: 'final' | 'streaming' = 'final') {
    this.upsertMessage({
      id: uuidv4(),
      role,
      content,
      createdAt: Date.now(),
      status,
    });
  }

  private upsertMessage(message: ConversationMessage) {
    const messages = this.snapshot.messages.some((item) => item.id === message.id)
      ? this.snapshot.messages.map((item) => (item.id === message.id ? message : item))
      : [...this.snapshot.messages, message];

    this.updateSnapshot({
      messages,
    });
  }

  private updateSnapshot(patch: Partial<ConversationSnapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
    this.args.onStateChange?.(this.snapshot.state);
  }
}
