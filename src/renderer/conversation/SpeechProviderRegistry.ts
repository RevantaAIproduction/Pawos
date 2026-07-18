import type { SpeechRecognitionProvider, TextToSpeechProvider } from './SpeechProviders';
import {
  createBrowserSpeechRecognitionProvider,
  createBrowserSpeechSynthesisProvider,
  createNoopSpeechRecognitionProvider,
  createNoopSpeechSynthesisProvider,
} from './SpeechProviders';
import { createOpenAiWhisperSttProvider } from './providers/OpenAiWhisperSttProvider';
import { createGeminiSttProvider } from './providers/GeminiSttProvider';
import { createOpenAiTtsProvider } from './providers/OpenAiTtsProvider';
import { createElevenLabsTtsProvider } from './providers/ElevenLabsTtsProvider';

export type SttProviderId = 'browser' | 'gemini' | 'whisper' | 'azure' | 'deepgram';
export type TtsProviderId = 'browser' | 'openai' | 'elevenlabs' | 'azure' | 'kokoro' | 'piper';

export type SttProviderConfig = { id: SttProviderId; apiKey?: string; model?: string; baseUrl?: string };
export type TtsProviderConfig = {
  id: TtsProviderId;
  apiKey?: string;
  voiceId?: string;
  model?: string;
  baseUrl?: string;
};

export function createSttProvider(config: SttProviderConfig): SpeechRecognitionProvider {
  switch (config.id) {
    case 'gemini': {
      const provider = createGeminiSttProvider({ apiKey: config.apiKey ?? '', model: config.model, baseUrl: config.baseUrl });
      return provider.isSupported() ? provider : createNoopSpeechRecognitionProvider();
    }
    case 'whisper':
      return createOpenAiWhisperSttProvider({ apiKey: config.apiKey ?? '', model: config.model, baseUrl: config.baseUrl });
    case 'azure':
    case 'deepgram':
      // Interface-ready: no API credentials/SDK wired yet. Returns an
      // honestly-unsupported provider rather than a fake one.
      return createNoopSpeechRecognitionProvider();
    case 'browser':
    default: {
      const provider = createBrowserSpeechRecognitionProvider();
      return provider.isSupported() ? provider : createNoopSpeechRecognitionProvider();
    }
  }
}

export function createTtsProvider(config: TtsProviderConfig): TextToSpeechProvider {
  switch (config.id) {
    case 'openai':
      return createOpenAiTtsProvider({ apiKey: config.apiKey ?? '', voice: config.voiceId, model: config.model, baseUrl: config.baseUrl });
    case 'elevenlabs':
      return createElevenLabsTtsProvider({
        apiKey: config.apiKey ?? '',
        voiceId: config.voiceId ?? '',
        modelId: config.model,
        baseUrl: config.baseUrl,
      });
    case 'azure':
    case 'kokoro':
    case 'piper':
      // Interface-ready: no API credentials/self-hosted endpoint wired yet.
      return createNoopSpeechSynthesisProvider();
    case 'browser':
    default: {
      const provider = createBrowserSpeechSynthesisProvider();
      return provider.isSupported() ? provider : createNoopSpeechSynthesisProvider();
    }
  }
}

export const STT_PROVIDER_CATALOG: { id: SttProviderId; label: string; status: 'available' | 'planned' }[] = [
  { id: 'browser', label: 'Browser speech recognition', status: 'available' },
  { id: 'gemini', label: 'Gemini (audio transcription)', status: 'available' },
  { id: 'whisper', label: 'OpenAI Whisper', status: 'available' },
  { id: 'azure', label: 'Azure Speech', status: 'planned' },
  { id: 'deepgram', label: 'Deepgram', status: 'planned' },
];

export const TTS_PROVIDER_CATALOG: { id: TtsProviderId; label: string; status: 'available' | 'planned' }[] = [
  { id: 'browser', label: 'Browser speech synthesis', status: 'available' },
  { id: 'openai', label: 'OpenAI TTS', status: 'available' },
  { id: 'elevenlabs', label: 'ElevenLabs', status: 'available' },
  { id: 'azure', label: 'Azure TTS', status: 'planned' },
  { id: 'kokoro', label: 'Kokoro', status: 'planned' },
  { id: 'piper', label: 'Piper', status: 'planned' },
];
