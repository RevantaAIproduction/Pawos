import type { SpeechRecognitionCallbacks, SpeechRecognitionProvider, SpeechRecognitionSession } from '../SpeechProviders';
// [DEBUG-TEMP] remove this import and every voiceDebugBus.emit() call below once real-mic verification is done.
import { voiceDebugBus } from '../VoiceDebugBus';

export type GeminiSttConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** BCP-47 code (e.g. 'fr-FR') from the profile menu's Language picker — passed as a real hint in the transcription prompt, genuinely improving accuracy for that language rather than relying on auto-detection alone. */
  language?: string;
};

const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1200;
const MAX_RECORDING_MS = 20000;
const MIN_SPEECH_MS = 300;
const SAMPLE_INTERVAL_MS = 150;

function pickMimeType(): string {
  const candidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

/** Real BCP-47-to-language-name mapping for the languages the profile menu actually offers — used only to phrase the transcription hint naturally, not for any other logic. */
const LANGUAGE_HINT_NAMES: Record<string, string> = {
  'en-US': 'English',
  'fr-FR': 'French',
  'de-DE': 'German',
  'hi-IN': 'Hindi',
  'es-ES': 'Spanish',
  'ja-JP': 'Japanese',
};

async function transcribeAudio(args: { baseUrl: string; model: string; apiKey: string; base64Audio: string; mimeType: string; language?: string }): Promise<string> {
  const url = `${args.baseUrl}/models/${args.model}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
  voiceDebugBus.emit({ type: 'request', url, mimeType: args.mimeType, audioBytes: args.base64Audio.length }); // [DEBUG-TEMP]
  const languageName = args.language ? LANGUAGE_HINT_NAMES[args.language] : undefined;
  const instruction = languageName
    ? `Transcribe this audio exactly as spoken. The speaker is using ${languageName}. Reply with only the transcription text — no commentary, no quotes, no extra words.`
    : 'Transcribe this audio exactly as spoken. Reply with only the transcription text — no commentary, no quotes, no extra words.';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: instruction },
            { inline_data: { mime_type: args.mimeType.split(';')[0], data: args.base64Audio } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    voiceDebugBus.emit({ type: 'response', status: res.status, bodyPreview: body.slice(0, 300) }); // [DEBUG-TEMP]
    throw new Error(`Gemini transcription failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  voiceDebugBus.emit({ type: 'response', status: res.status, bodyPreview: JSON.stringify(json).slice(0, 300) }); // [DEBUG-TEMP]
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text ?? '').join('');
  return text.trim();
}

/**
 * Real speech-to-text via Gemini's audio-understanding, not Electron's
 * built-in webkitSpeechRecognition — confirmed (not assumed) that the
 * browser one cannot work here: Chromium's speech-recognition backend
 * needs a Google API key baked into official Chrome builds, which Electron
 * doesn't have, so it reliably fails with a 'network' error a few seconds
 * in regardless of real connectivity.
 *
 * There's no live interim transcript — Gemini transcribes the whole clip
 * at once, not word by word — so this records until client-side silence
 * detection (a Web Audio AnalyserNode watching RMS volume) decides you've
 * stopped talking, then sends the whole recording for transcription in a
 * single call. A hard cap stops an open mic from recording forever if
 * silence detection somehow never fires.
 */
export function createGeminiSttProvider(config: GeminiSttConfig): SpeechRecognitionProvider {
  const baseUrl = config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const model = config.model ?? 'gemini-flash-latest';

  return {
    name: 'gemini-stt',
    isSupported() {
      return (
        Boolean(config.apiKey) &&
        typeof MediaRecorder !== 'undefined' &&
        typeof navigator?.mediaDevices?.getUserMedia === 'function'
      );
    },
    async start(callbacks: SpeechRecognitionCallbacks): Promise<SpeechRecognitionSession> {
      const mimeType = pickMimeType();
      if (!mimeType) {
        const message = 'No supported audio recording format is available in this app.';
        voiceDebugBus.emit({ type: 'stage', label: 'Recording start failed', status: 'error', detail: message }); // [DEBUG-TEMP]
        callbacks.onError(new Error(message));
        return { stop: () => {}, cancel: () => {} };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        // [DEBUG-TEMP]
        voiceDebugBus.emit({
          type: 'stage',
          label: 'Microphone permission denied',
          status: 'error',
          detail: error instanceof Error ? error.message : String(error),
        });
        callbacks.onPermissionDenied();
        return { stop: () => {}, cancel: () => {} };
      }
      // [DEBUG-TEMP]
      voiceDebugBus.emit({ type: 'mic', deviceLabel: stream.getAudioTracks()[0]?.label || 'Unknown device' });

      let stopped = false;
      let shouldSend = true;
      let speechDetectedAt: number | null = null;
      let quietSinceMs: number | null = null;
      const startedAt = Date.now();
      const chunks: BlobPart[] = [];

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.fftSize);

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const sampleTimer = window.setInterval(() => {
        if (stopped) return;
        analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = ((dataArray[i] ?? 128) - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const now = Date.now();
        voiceDebugBus.emit({ type: 'level', level: rms, elapsedMs: now - startedAt }); // [DEBUG-TEMP]

        if (rms > SILENCE_RMS_THRESHOLD) {
          if (!speechDetectedAt) speechDetectedAt = now;
          quietSinceMs = null;
        } else if (speechDetectedAt) {
          if (quietSinceMs === null) quietSinceMs = now;
          if (now - quietSinceMs >= SILENCE_DURATION_MS) {
            voiceDebugBus.emit({ type: 'stage', label: 'Silence detected', status: 'ok' }); // [DEBUG-TEMP]
            requestStop(true);
            return;
          }
        }

        if (now - startedAt >= MAX_RECORDING_MS) requestStop(true);
      }, SAMPLE_INTERVAL_MS);

      const cleanup = () => {
        window.clearInterval(sampleTimer);
        stream.getTracks().forEach((track) => track.stop());
        void audioContext.close().catch(() => {});
      };

      const finish = async () => {
        if (stopped) return;
        stopped = true;
        cleanup();

        if (!shouldSend) {
          callbacks.onEnd?.();
          return;
        }

        const elapsedSpeechMs = speechDetectedAt ? Date.now() - speechDetectedAt : 0;
        if (elapsedSpeechMs < MIN_SPEECH_MS) {
          callbacks.onEnd?.();
          return;
        }

        try {
          const blob = new Blob(chunks, { type: mimeType });
          // [DEBUG-TEMP]
          voiceDebugBus.emit({ type: 'recorded', sizeBytes: blob.size, durationMs: Date.now() - startedAt, mimeType });
          voiceDebugBus.emit({ type: 'stage', label: 'Encoding audio', status: 'ok' }); // [DEBUG-TEMP]
          const base64Audio = await blobToBase64(blob);
          const transcript = await transcribeAudio({ baseUrl, model, apiKey: config.apiKey, base64Audio, mimeType, language: config.language });
          if (transcript) {
            voiceDebugBus.emit({ type: 'transcript', text: transcript }); // [DEBUG-TEMP]
            voiceDebugBus.emit({ type: 'stage', label: 'Sending to Conversation Runtime', status: 'ok', detail: transcript }); // [DEBUG-TEMP]
            callbacks.onFinalTranscript(transcript);
          } else {
            voiceDebugBus.emit({ type: 'stage', label: 'No speech detected in recording', status: 'info' }); // [DEBUG-TEMP]
            callbacks.onEnd?.();
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Transcription failed.';
          voiceDebugBus.emit({ type: 'stage', label: 'Transcription failed', status: 'error', detail: message }); // [DEBUG-TEMP]
          callbacks.onError(error instanceof Error ? error : new Error(message));
        }
      };

      recorder.onstop = () => {
        voiceDebugBus.emit({ type: 'stage', label: 'Recording stopped', status: 'ok' }); // [DEBUG-TEMP]
        void finish();
      };

      const requestStop = (send: boolean) => {
        if (stopped) return;
        shouldSend = send;
        if (recorder.state !== 'inactive') recorder.stop();
        else void finish();
      };

      recorder.start();
      voiceDebugBus.emit({ type: 'stage', label: 'Recording started', status: 'ok' }); // [DEBUG-TEMP]

      return {
        stop: () => requestStop(true),
        cancel: () => requestStop(false),
      };
    },
  };
}
