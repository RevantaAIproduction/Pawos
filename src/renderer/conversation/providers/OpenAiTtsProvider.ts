import type { SpeechSynthesisCallbacks, TextToSpeechProvider } from '../SpeechProviders';

export type OpenAiTtsConfig = {
  apiKey: string;
  voice?: string;
  model?: string;
  baseUrl?: string;
  /** OpenAI's own `speed` request field (0.25-4.0, 1 = normal) — a real API parameter, not a client-side approximation. */
  speed?: number;
};

/**
 * OpenAI's TTS endpoint returns raw audio only — no phoneme/timing data —
 * so supportsVisemes is honestly false here. Playback uses the browser's
 * <audio> element via an object URL.
 */
export function createOpenAiTtsProvider(config: OpenAiTtsConfig): TextToSpeechProvider {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  let currentAudio: HTMLAudioElement | null = null;

  return {
    name: 'openai-tts',
    supportsVisemes: false,
    isSupported() {
      return Boolean(config.apiKey);
    },
    async speak(text: string, callbacks?: SpeechSynthesisCallbacks): Promise<void> {
      const res = await fetch(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model ?? 'gpt-4o-mini-tts',
          voice: config.voice ?? 'alloy',
          input: text,
          ...(config.speed !== undefined ? { speed: Math.max(0.25, Math.min(4, config.speed)) } : {}),
        }),
      });

      if (!res.ok) {
        const error = new Error(`OpenAI TTS request failed (${res.status}).`);
        callbacks?.onError?.(error);
        throw error;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;

      return new Promise<void>((resolve, reject) => {
        audio.onplay = () => callbacks?.onStart?.();
        audio.onended = () => {
          URL.revokeObjectURL(url);
          callbacks?.onEnd?.();
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          const error = new Error('OpenAI TTS playback failed.');
          callbacks?.onError?.(error);
          reject(error);
        };
        void audio.play();
      });
    },
    stop() {
      currentAudio?.pause();
      currentAudio = null;
    },
  };
}
