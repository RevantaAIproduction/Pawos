export type SpeechRecognitionCallbacks = {
  onPartialTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onPermissionDenied: () => void;
  onEnd?: () => void;
  onError: (error: Error) => void;
};

export type SpeechRecognitionSession = {
  stop: () => void;
  cancel: () => void;
};

export interface SpeechRecognitionProvider {
  readonly name: string;
  isSupported(): boolean;
  start(callbacks: SpeechRecognitionCallbacks): Promise<SpeechRecognitionSession>;
}

export type SpeechSynthesisCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
};

export interface TextToSpeechProvider {
  readonly name: string;
  isSupported(): boolean;
  speak(text: string, callbacks?: SpeechSynthesisCallbacks): Promise<void>;
  stop(): void;
}

type BrowserSpeechRecognitionConstructor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
  const globalWindow = window as any;
  return (globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition ?? null) as
    | BrowserSpeechRecognitionConstructor
    | null;
}

export function createBrowserSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return {
    name: 'browser-speech-recognition',
    isSupported() {
      return Boolean(getSpeechRecognitionConstructor());
    },
    async start(callbacks: SpeechRecognitionCallbacks): Promise<SpeechRecognitionSession> {
      const SpeechRecognition = getSpeechRecognitionConstructor();
      if (!SpeechRecognition) {
        throw new Error('Speech recognition is not supported in this browser.');
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      let finalTranscript = '';
      let handledFinal = false;

      recognition.onresult = (event: any) => {
        const results = Array.from(event.results ?? []);
        let interimTranscript = '';
        for (const result of results) {
          const transcript = result?.[0]?.transcript?.toString?.() ?? '';
          if (result?.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const combined = `${finalTranscript} ${interimTranscript}`.trim();
        if (combined) {
          callbacks.onPartialTranscript(combined);
        }

        if (!handledFinal && finalTranscript.trim()) {
          handledFinal = true;
          callbacks.onFinalTranscript(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        const errorName = String(event?.error ?? 'unknown');
        if (errorName === 'not-allowed' || errorName === 'service-not-allowed') {
          callbacks.onPermissionDenied();
          return;
        }
        callbacks.onError(new Error(event?.message ?? errorName));
      };

      recognition.onend = () => {
        callbacks.onEnd?.();
      };

      recognition.start();

      return {
        stop: () => recognition.stop(),
        cancel: () => recognition.abort(),
      };
    },
  };
}

export function createBrowserSpeechSynthesisProvider(): TextToSpeechProvider {
  return {
    name: 'browser-speech-synthesis',
    isSupported() {
      return typeof window !== 'undefined' && Boolean(window.speechSynthesis);
    },
    speak(text: string, callbacks?: SpeechSynthesisCallbacks): Promise<void> {
      return new Promise((resolve, reject) => {
        const synthesis = window.speechSynthesis;
        if (!synthesis) {
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => callbacks?.onStart?.();
        utterance.onend = () => {
          callbacks?.onEnd?.();
          resolve();
        };
        utterance.onerror = () => {
          const error = new Error('Speech synthesis failed.');
          callbacks?.onError?.(error);
          reject(error);
        };

        synthesis.cancel();
        synthesis.speak(utterance);
      });
    },
    stop() {
      window.speechSynthesis?.cancel();
    },
  };
}

export function createNoopSpeechRecognitionProvider(): SpeechRecognitionProvider {
  return {
    name: 'noop-speech-recognition',
    isSupported() {
      return false;
    },
    async start(): Promise<SpeechRecognitionSession> {
      throw new Error('Speech recognition is not available.');
    },
  };
}

export function createNoopSpeechSynthesisProvider(): TextToSpeechProvider {
  return {
    name: 'noop-speech-synthesis',
    isSupported() {
      return false;
    },
    async speak() {
      return;
    },
    stop() {
      return;
    },
  };
}
