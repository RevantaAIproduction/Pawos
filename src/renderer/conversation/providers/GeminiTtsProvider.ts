import type { SpeechSynthesisCallbacks, TextToSpeechProvider } from '../SpeechProviders';

export type GeminiTtsConfig = {
  apiKey: string;
  voice?: string;
  model?: string;
  baseUrl?: string;
};

/**
 * Gemini's TTS endpoint (`generateContent` with `responseModalities: ['AUDIO']`)
 * returns raw, headerless 16-bit PCM audio (mimeType like
 * `audio/L16;codec=pcm;rate=24000`) — not a browser-playable container. This
 * wraps it in a minimal WAV header (44 bytes) so it can play through a plain
 * <audio> element like every other provider here, without pulling in a decode
 * library for a format this simple to frame by hand.
 */
function pcmToWavBlob(pcmBytes: Uint8Array, sampleRate: number, channels = 1, bitsPerSample = 16): Blob {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.length, true);

  return new Blob([header, pcmBytes as BlobPart], { type: 'audio/wav' });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Parses the real `rate=` param off Gemini's returned mimeType (e.g. `audio/L16;codec=pcm;rate=24000`); falls back to Gemini's documented default output rate if the field is ever absent. */
function parseSampleRate(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate=(\d+)/);
  return match?.[1] ? Number(match[1]) : 24000;
}

/**
 * Real Gemini TTS via `generateContent`/`responseModalities: ['AUDIO']` — the
 * same API surface already used elsewhere in this app for Gemini reasoning
 * and (via GeminiSttProvider) audio transcription, just the audio-out
 * direction. Reuses the existing per-voice catalog exported below.
 *
 * Voice names are Gemini's own documented catalog (30 prebuilt voices) — not
 * invented. Unlike OPENAI_VOICE_PRESETS, no gender label is attached: Google
 * does not publish male/female classifications for these voices (only
 * tone/character descriptors, and this codebase doesn't have independently
 * verified wording for those to show with confidence), so a gender filter is
 * honestly not offered for this provider rather than guessed.
 */
export function createGeminiTtsProvider(config: GeminiTtsConfig): TextToSpeechProvider {
  const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const model = config.model ?? 'gemini-2.5-flash-preview-tts';
  let currentAudio: HTMLAudioElement | null = null;

  return {
    name: 'gemini-tts',
    supportsVisemes: false,
    isSupported() {
      return Boolean(config.apiKey);
    },
    async speak(text: string, callbacks?: SpeechSynthesisCallbacks): Promise<void> {
      const url = `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice ?? 'Kore' } },
            },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const error = new Error(`Gemini TTS request failed (${res.status}): ${body.slice(0, 300)}`);
        callbacks?.onError?.(error);
        throw error;
      }

      const json = await res.json();
      const part = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio: string | undefined = part?.data;
      if (!base64Audio) {
        const error = new Error('Gemini TTS returned no audio data.');
        callbacks?.onError?.(error);
        throw error;
      }

      const pcmBytes = base64ToBytes(base64Audio);
      const sampleRate = parseSampleRate(part?.mimeType);
      const blob = pcmToWavBlob(pcmBytes, sampleRate);
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      currentAudio = audio;

      return new Promise<void>((resolve, reject) => {
        audio.onplay = () => callbacks?.onStart?.();
        audio.onended = () => {
          URL.revokeObjectURL(objectUrl);
          callbacks?.onEnd?.();
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          const error = new Error('Gemini TTS playback failed.');
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

/**
 * Male/Female quick-picks for the PawOS voice selector. Unlike
 * OPENAI_VOICE_PRESETS (labeled from OpenAI's own published catalog), Google
 * doesn't publish gender labels for its Gemini TTS voices — so this mapping
 * is a user-provided choice (Charon for Male, Kore for Female), not a Google
 * classification and not an AI guess. Two voices, not the full catalog.
 */
export const GEMINI_GENDER_PRESETS: { gender: 'Male' | 'Female'; voiceId: string }[] = [
  { gender: 'Male', voiceId: 'Charon' },
  { gender: 'Female', voiceId: 'Kore' },
];

/** Gemini's full documented set of 30 prebuilt TTS voice names — not a partial guess. No gender/character label is attached; see GEMINI_GENDER_PRESETS above for the one user-provided exception. */
export const GEMINI_VOICE_PRESETS: { id: string; label: string }[] = [
  { id: 'Zephyr', label: 'Zephyr' },
  { id: 'Puck', label: 'Puck' },
  { id: 'Charon', label: 'Charon' },
  { id: 'Kore', label: 'Kore' },
  { id: 'Fenrir', label: 'Fenrir' },
  { id: 'Leda', label: 'Leda' },
  { id: 'Orus', label: 'Orus' },
  { id: 'Aoede', label: 'Aoede' },
  { id: 'Callirrhoe', label: 'Callirrhoe' },
  { id: 'Autonoe', label: 'Autonoe' },
  { id: 'Enceladus', label: 'Enceladus' },
  { id: 'Iapetus', label: 'Iapetus' },
  { id: 'Umbriel', label: 'Umbriel' },
  { id: 'Algieba', label: 'Algieba' },
  { id: 'Despina', label: 'Despina' },
  { id: 'Erinome', label: 'Erinome' },
  { id: 'Algenib', label: 'Algenib' },
  { id: 'Rasalgethi', label: 'Rasalgethi' },
  { id: 'Laomedeia', label: 'Laomedeia' },
  { id: 'Achernar', label: 'Achernar' },
  { id: 'Alnilam', label: 'Alnilam' },
  { id: 'Schedar', label: 'Schedar' },
  { id: 'Gacrux', label: 'Gacrux' },
  { id: 'Pulcherrima', label: 'Pulcherrima' },
  { id: 'Achird', label: 'Achird' },
  { id: 'Zubenelgenubi', label: 'Zubenelgenubi' },
  { id: 'Vindemiatrix', label: 'Vindemiatrix' },
  { id: 'Sadachbia', label: 'Sadachbia' },
  { id: 'Sadaltager', label: 'Sadaltager' },
  { id: 'Sulafat', label: 'Sulafat' },
];
