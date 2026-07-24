import type { SpeechSynthesisCallbacks, TextToSpeechProvider } from '../SpeechProviders';
import { graphemeToViseme } from './graphemeToViseme';

export type ElevenLabsTtsConfig = {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  baseUrl?: string;
  /** ElevenLabs' own real voice_settings.style parameter (0-1) — higher exaggerates the voice's natural style/expressiveness. Sent only when set, so an unconfigured value falls back to the voice's own account-level default rather than a fabricated one. */
  style?: number;
};

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

/**
 * ElevenLabs' "with-timestamps" endpoint returns character-level alignment
 * (start/end seconds per character), not true phonemes. We derive
 * approximate visemes from that alignment via graphemeToViseme — good
 * enough for believable mouth movement, not lab-accurate lip sync.
 */
export function createElevenLabsTtsProvider(config: ElevenLabsTtsConfig): TextToSpeechProvider {
  const baseUrl = config.baseUrl ?? 'https://api.elevenlabs.io/v1';
  let currentAudio: HTMLAudioElement | null = null;
  let visemeTimers: number[] = [];

  const clearTimers = () => {
    visemeTimers.forEach((t) => window.clearTimeout(t));
    visemeTimers = [];
  };

  return {
    name: 'elevenlabs-tts',
    supportsVisemes: true,
    isSupported() {
      return Boolean(config.apiKey && config.voiceId);
    },
    async speak(text: string, callbacks?: SpeechSynthesisCallbacks): Promise<void> {
      const res = await fetch(`${baseUrl}/text-to-speech/${config.voiceId}/with-timestamps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': config.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: config.modelId ?? 'eleven_turbo_v2_5',
          ...(config.style !== undefined ? { voice_settings: { style: Math.max(0, Math.min(1, config.style)) } } : {}),
        }),
      });

      if (!res.ok) {
        const error = new Error(`ElevenLabs TTS request failed (${res.status}).`);
        callbacks?.onError?.(error);
        throw error;
      }

      const json = await res.json();
      const blob = base64ToBlob(json.audio_base64, 'audio/mpeg');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;

      const characters: string[] = json.alignment?.characters ?? [];
      const startTimes: number[] = json.alignment?.character_start_times_seconds ?? [];

      return new Promise<void>((resolve, reject) => {
        audio.onplay = () => {
          callbacks?.onStart?.();
          if (callbacks?.onVisemeFrame) {
            characters.forEach((char, i) => {
              const timeMs = (startTimes[i] ?? 0) * 1000;
              const timer = window.setTimeout(() => {
                callbacks.onVisemeFrame?.({ timeMs, viseme: graphemeToViseme(char), weight: 1 });
              }, timeMs);
              visemeTimers.push(timer);
            });
          }
        };
        audio.onended = () => {
          clearTimers();
          URL.revokeObjectURL(url);
          callbacks?.onEnd?.();
          resolve();
        };
        audio.onerror = () => {
          clearTimers();
          URL.revokeObjectURL(url);
          const error = new Error('ElevenLabs TTS playback failed.');
          callbacks?.onError?.(error);
          reject(error);
        };
        void audio.play();
      });
    },
    stop() {
      clearTimers();
      currentAudio?.pause();
      currentAudio = null;
    },
  };
}
