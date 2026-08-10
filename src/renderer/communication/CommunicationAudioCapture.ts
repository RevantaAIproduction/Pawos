import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { CommunicationUploadQueue, type UploadQueueItem } from './CommunicationUploadQueue';

/**
 * Real desktop audio (and, for meeting mediums, video) capture for the Communication Intelligence
 * Runtime — same getUserMedia/MediaRecorder mechanism already proven in GeminiSttProvider.ts (mic
 * capture for speech-to-text), extended with optional system-audio/video capture via
 * getDisplayMedia. Recording & Storage Foundation (Phase 1): every chunk is streamed to durable
 * main-process storage the moment it's produced via CommunicationUploadQueue — the renderer never
 * accumulates the whole recording in memory, so a multi-hour recording costs the same, bounded
 * amount of renderer memory as a one-minute one.
 */

let chunkSeq = 0;

function pickMimeType(candidates: string[]): string {
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
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read a recorded chunk.'));
    reader.readAsDataURL(blob);
  });
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export type CaptureHandle = {
  stop: () => Promise<{ ok: boolean; audioPath?: string; videoPath?: string; message?: string }>;
  /** True once real audio has actually been written since the last check — the live "evidence" signal for the Communication Workspace (architecture doc §14), not an optimistic assumption. */
  hasRecentAudio: () => boolean;
  /** Real pause/resume of the live capture (Recording & Storage Foundation "resumable recording" requirement) — driven by CommunicationRuntime's recordingPauseRequested/recordingResumeRequested events, since the main process has no direct MediaRecorder handle of its own. */
  pause: () => void;
  resume: () => void;
};

export type CaptureOptions = {
  /** Meeting-style sources capture system audio (the other party) alongside the mic, and — when the OS/browser actually grants a video track — real video too; face-to-face/voice notes are mic-only, audio-only. */
  includeSystemAudio?: boolean;
  onError?: (error: Error) => void;
};

export function attachRecorder(
  communicationId: string,
  kind: 'audio' | 'video',
  stream: MediaStream,
  mimeType: string,
  onEvidence: () => void
): { recorder: MediaRecorder; queue: CommunicationUploadQueue; stop: () => Promise<void> } {
  const queue = new CommunicationUploadQueue({
    sendChunk: async (item: UploadQueueItem) => {
      return ipc.communicationAppendRecordingChunk(communicationId, item.kind, item.base64Chunk, item.checksum);
    },
  });

  const recorder = new MediaRecorder(stream, { mimeType });
  // Tracks each ondataavailable handler's in-flight checksum/base64-encode chain — MediaRecorder
  // fires its final 'dataavailable' event (with the last chunk of data) and then 'onstop' in close
  // succession, but the handler below does real async work (arrayBuffer/digest/base64) before it
  // ever calls queue.enqueue(). Without tracking this, stop() could see `finished` resolve and call
  // queue.waitForDrain() — which only inspects items already enqueued — before the very last chunk
  // has been enqueued at all, silently dropping it from the finalized recording.
  const pendingChunks = new Set<Promise<void>>();

  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    onEvidence();
    const pending = (async () => {
      const arrayBuffer = await event.data.arrayBuffer();
      const checksum = await sha256Hex(arrayBuffer);
      const base64Chunk = await blobToBase64(event.data);
      queue.enqueue({ seq: chunkSeq++, kind, base64Chunk, checksum });
    })();
    pendingChunks.add(pending);
    void pending.finally(() => pendingChunks.delete(pending));
  };

  recorder.start(2000); // real periodic chunks — this is now the actual streaming-write cadence, not just a UI-liveness signal

  return {
    recorder,
    queue,
    stop: async () => {
      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      if (recorder.state !== 'inactive') recorder.stop();
      await finished;
      // Wait for every dataavailable handler's own async processing to finish enqueuing — including
      // the final chunk's, which can still be in flight the instant `finished` resolves — before
      // asking the queue to drain; otherwise waitForDrain() can return before that chunk even exists.
      await Promise.all(pendingChunks);
      await queue.waitForDrain();
    },
  };
}

export async function startCommunicationAudioCapture(communicationId: string, options: CaptureOptions = {}): Promise<CaptureHandle> {
  const audioMimeType = pickMimeType(['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm']);
  if (!audioMimeType) throw new Error('No supported audio recording format is available in this app.');

  const streamsToStop: MediaStream[] = [];
  const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  streamsToStop.push(micStream);
  const audioTracks: MediaStreamTrack[] = [...micStream.getAudioTracks()];

  let videoTrack: MediaStreamTrack | null = null;
  if (options.includeSystemAudio && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      streamsToStop.push(displayStream);
      audioTracks.push(...displayStream.getAudioTracks());
      // Real video recording (Recording & Storage Foundation) — the video track used to be stopped
      // and discarded immediately; it's now kept and recorded into its own file whenever the OS/
      // browser actually grants one. Honestly absent (never recorded) when it isn't — no fabricated
      // video for face-to-face/voice-note/phone-call mediums, which never request a display stream.
      const [track] = displayStream.getVideoTracks();
      videoTrack = track ?? null;
    } catch {
      // The user declined screen/audio sharing, or the OS doesn't support it — mic-only capture
      // still proceeds, honestly degraded rather than failing the whole recording.
    }
  }

  let lastChunkAt = Date.now();
  const onEvidence = () => {
    lastChunkAt = Date.now();
    window.dispatchEvent(new CustomEvent('pawos:communication-audio-chunk', { detail: { communicationId } }));
  };

  const audioStream = new MediaStream(audioTracks);
  const audio = attachRecorder(communicationId, 'audio', audioStream, audioMimeType, onEvidence);

  let video: ReturnType<typeof attachRecorder> | null = null;
  if (videoTrack) {
    const videoMimeType = pickMimeType(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']);
    if (videoMimeType) {
      const videoStream = new MediaStream([videoTrack, ...audioTracks]);
      video = attachRecorder(communicationId, 'video', videoStream, videoMimeType, onEvidence);
    }
  }

  for (const recorderState of [audio, video]) {
    recorderState?.recorder.addEventListener('error', (event) => {
      options.onError?.(new Error(`Recording error: ${(event as unknown as { error?: Error }).error?.message ?? 'unknown'}`));
    });
  }

  return {
    hasRecentAudio: () => Date.now() - lastChunkAt < 5000,
    pause: () => {
      if (audio.recorder.state === 'recording') audio.recorder.pause();
      if (video && video.recorder.state === 'recording') video.recorder.pause();
    },
    resume: () => {
      if (audio.recorder.state === 'paused') audio.recorder.resume();
      if (video && video.recorder.state === 'paused') video.recorder.resume();
    },
    stop: async () => {
      await audio.stop();
      if (video) await video.stop();
      streamsToStop.forEach((s) => s.getTracks().forEach((t) => t.stop()));

      const audioResult = await ipc.communicationFinalizeRecording(communicationId, 'audio', audioMimeType);
      if (!audioResult.ok) return { ok: false, message: audioResult.message ?? 'Failed to finalize the recording.' };

      let videoPath: string | undefined;
      if (video) {
        const videoResult = await ipc.communicationFinalizeRecording(communicationId, 'video', 'video/webm');
        if (videoResult.ok && videoResult.data) videoPath = videoResult.data.path;
      }

      if (!audioResult.data) return { ok: false, message: 'No audio was captured.' };
      return { ok: true, audioPath: audioResult.data.path, videoPath };
    },
  };
}
