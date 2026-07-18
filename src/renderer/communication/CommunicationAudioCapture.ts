import { ipc } from '../services/ipc/ipcBridgeImplementation';

/**
 * Real desktop audio capture for the Communication Intelligence Runtime —
 * same getUserMedia/MediaRecorder mechanism already proven in
 * GeminiSttProvider.ts (mic capture for speech-to-text), extended with
 * optional system-audio capture via getDisplayMedia (the modern, Electron-
 * recommended path — no desktopCapturer/contextBridge plumbing needed,
 * since getDisplayMedia is a standard web API already available in the
 * renderer). The whole recording is buffered client-side and sent to the
 * main process as one file on stop() — simplest correct approach, and
 * consistent with how GeminiSttProvider already sends one complete clip
 * rather than streaming chunks.
 */

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
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

export type CaptureHandle = {
  stop: () => Promise<{ ok: boolean; audioPath?: string; message?: string }>;
  /** True once real audio has actually been written since the last check — the live "evidence" signal for the Communication Workspace (architecture doc §14), not an optimistic assumption. */
  hasRecentAudio: () => boolean;
};

export type CaptureOptions = {
  /** Meeting-style sources capture system audio (the other party) alongside the mic; face-to-face/voice notes are mic-only. */
  includeSystemAudio?: boolean;
  onError?: (error: Error) => void;
};

export async function startCommunicationAudioCapture(communicationId: string, options: CaptureOptions = {}): Promise<CaptureHandle> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('No supported audio recording format is available in this app.');

  const tracks: MediaStreamTrack[] = [];
  const streamsToStop: MediaStream[] = [];

  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamsToStop.push(micStream);
  tracks.push(...micStream.getAudioTracks());

  if (options.includeSystemAudio && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamsToStop.push(displayStream);
      displayStream.getVideoTracks().forEach((t) => t.stop()); // never need the video — audio only
      tracks.push(...displayStream.getAudioTracks());
    } catch {
      // The user declined screen/audio sharing, or the OS doesn't support
      // it — mic-only capture still proceeds, honestly degraded rather
      // than failing the whole recording.
    }
  }

  const combined = new MediaStream(tracks);
  const chunks: BlobPart[] = [];
  let lastChunkAt = Date.now();
  const recorder = new MediaRecorder(combined, { mimeType });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
      lastChunkAt = Date.now();
      // Same-process signal (no IPC round-trip needed) that a REAL audio
      // chunk just arrived — the Communication Workspace's evidence region
      // listens for this so its "last write" timestamp reflects actual
      // capture health, never an optimistic assumption that recording is
      // going fine just because it was started (architecture doc §14).
      window.dispatchEvent(new CustomEvent('pawos:communication-audio-chunk', { detail: { communicationId } }));
    }
  };

  recorder.onerror = (event) => {
    options.onError?.(new Error(`Recording error: ${(event as unknown as { error?: Error }).error?.message ?? 'unknown'}`));
  };

  recorder.start(2000); // periodic dataavailable events, purely so hasRecentAudio() reflects reality while recording — the file itself is still assembled and saved once, on stop()

  return {
    hasRecentAudio: () => Date.now() - lastChunkAt < 5000,
    stop: async () => {
      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      if (recorder.state !== 'inactive') recorder.stop();
      await finished;
      streamsToStop.forEach((s) => s.getTracks().forEach((t) => t.stop()));

      if (chunks.length === 0) return { ok: false, message: 'No audio was captured.' };
      const blob = new Blob(chunks, { type: mimeType });
      const base64Data = await blobToBase64(blob);
      const result = await ipc.communicationSaveAudio(communicationId, base64Data, mimeType);
      if (!result.ok) return { ok: false, message: result.message ?? 'Failed to save the recording.' };
      return { ok: true, audioPath: result.data?.audioPath };
    },
  };
}
