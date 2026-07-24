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

import type { VisemeFrame } from './LipSyncTypes';

export type SpeechSynthesisCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  /**
   * Fired during playback for providers that can supply mouth-shape timing.
   * Never called by providers whose `supportsVisemes` is false — the
   * companion's animation layer must not assume this ever fires.
   */
  onVisemeFrame?: (frame: VisemeFrame) => void;
};

export interface TextToSpeechProvider {
  readonly name: string;
  /** Whether this provider can drive onVisemeFrame. Honest per-provider — never assumed. */
  readonly supportsVisemes: boolean;
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

/** Standard SpeechRecognitionErrorEvent.error codes mapped to something a user can actually act on. */
const SPEECH_ERROR_MESSAGES: Record<string, string> = {
  'no-speech': "Didn't hear anything — try again.",
  'audio-capture': 'No microphone found. Check that one is connected and enabled.',
  network: 'Speech recognition needs a network connection.',
  aborted: 'Listening was interrupted.',
  'bad-grammar': 'Speech recognition configuration error.',
  'language-not-supported': 'This language is not supported for speech recognition.',
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
        // event.message is very often an empty string (not null/undefined)
        // on real SpeechRecognitionErrorEvents — `||` catches that where `??`
        // wouldn't, so the user sees a real reason instead of a bare "Error".
        const detail = event?.message || SPEECH_ERROR_MESSAGES[errorName] || errorName;
        callbacks.onError(new Error(detail));
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

/** Real, live system voices — this is dynamic per OS/browser, never a hardcoded list, since Web Speech API voices vary by machine. Chromium loads voices asynchronously on first access, hence the 'voiceschanged' fallback. */
export function listBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synthesis) {
      resolve([]);
      return;
    }
    const existing = synthesis.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const handler = () => {
      synthesis.removeEventListener('voiceschanged', handler);
      resolve(synthesis.getVoices());
    };
    synthesis.addEventListener('voiceschanged', handler);
    // Some browsers never fire voiceschanged if voices were already
    // available at addEventListener time — a short timeout resolves with
    // whatever's there rather than hanging forever on an event that won't come.
    window.setTimeout(() => {
      synthesis.removeEventListener('voiceschanged', handler);
      resolve(synthesis.getVoices());
    }, 500);
  });
}

/**
 * rate/pitch are the Web Speech API's own real controls
 * (SpeechSynthesisUtterance.rate 0.1-10, .pitch 0-2) — rate is clamped to
 * 0.5-2 to match the Companion Editor's speed slider; pitch to its own 0-2
 * range. voiceName, when it matches a real system voice from
 * listBrowserVoices(), selects that exact voice; otherwise the OS default
 * voice for the utterance's language is used, same as before this existed.
 */
export function createBrowserSpeechSynthesisProvider(rate?: number, pitch?: number, voiceName?: string): TextToSpeechProvider {
  return {
    name: 'browser-speech-synthesis',
    supportsVisemes: false,
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
        if (rate !== undefined) utterance.rate = Math.max(0.5, Math.min(2, rate));
        if (pitch !== undefined) utterance.pitch = Math.max(0, Math.min(2, pitch));
        if (voiceName) {
          const match = synthesis.getVoices().find((v) => v.name === voiceName);
          if (match) utterance.voice = match;
        }
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

        // No cancel() here — sentence-by-sentence chunked speech calls
        // speak() repeatedly in quick succession, and Chromium's Web Speech
        // API has a well-known bug where cancel() immediately followed by
        // speak() silently drops the new utterance (no audio, no error).
        // Interruption/barge-in is already handled by ConversationRuntime's
        // own explicit stop() calls, so cancelling preemptively here was
        // redundant and actively broke audio for every sentence after the first.
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
    supportsVisemes: false,
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
