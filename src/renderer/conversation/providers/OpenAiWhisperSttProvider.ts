import type {
  SpeechRecognitionCallbacks,
  SpeechRecognitionProvider,
  SpeechRecognitionSession,
} from '../SpeechProviders';

export type OpenAiWhisperSttConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
};

/**
 * Whisper's REST API is batch, not streaming: audio is recorded locally,
 * then uploaded once recording ends. There is no partial-transcript event,
 * so onPartialTranscript is never called — only onFinalTranscript, and only
 * after `stop()` (not `cancel()`, which discards the recording instead).
 *
 * NOTE: the current ConversationRuntime only ever calls `.cancel()` to tear
 * a session down (see ConversationRuntime.stopRecognition). Wiring this
 * provider into the live conversation flow requires adding a "finish
 * talking" UI action that calls `.stop()` instead — see project notes.
 */
export function createOpenAiWhisperSttProvider(config: OpenAiWhisperSttConfig): SpeechRecognitionProvider {
  const baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';

  return {
    name: 'openai-whisper',
    isSupported() {
      return Boolean(config.apiKey) && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
    },
    async start(callbacks: SpeechRecognitionCallbacks): Promise<SpeechRecognitionSession> {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

      const transcribe = async () => {
        try {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const form = new FormData();
          form.append('file', blob, 'audio.webm');
          form.append('model', config.model ?? 'whisper-1');

          const res = await fetch(`${baseUrl}/audio/transcriptions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.apiKey}` },
            body: form,
          });

          if (!res.ok) throw new Error(`Whisper request failed (${res.status}).`);

          const json = await res.json();
          const text: string = (json.text ?? '').trim();
          if (text) callbacks.onFinalTranscript(text);
        } catch (error) {
          callbacks.onError(error instanceof Error ? error : new Error('Whisper transcription failed.'));
        } finally {
          callbacks.onEnd?.();
        }
      };

      let settled = false;

      recorder.start();

      return {
        // Finish recording and transcribe what was captured.
        stop: () => {
          if (settled) return;
          settled = true;
          recorder.onstop = () => {
            stopTracks();
            void transcribe();
          };
          recorder.stop();
        },
        // Abort without transcribing.
        cancel: () => {
          if (settled) return;
          settled = true;
          recorder.onstop = null;
          recorder.stop();
          stopTracks();
        },
      };
    },
  };
}
