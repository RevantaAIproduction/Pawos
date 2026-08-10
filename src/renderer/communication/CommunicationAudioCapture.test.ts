import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for a real race found while building the Phase 1 Final Production Verification's
 * state-transition proof: MediaRecorder fires its final 'dataavailable' event (carrying the last
 * chunk of data) immediately before 'onstop', but the handler for that event does real async work
 * (arrayBuffer/digest/base64-encode) before it ever calls queue.enqueue(). Without tracking those
 * in-flight chains, stop() could see `onstop` resolve and then call queue.waitForDrain() — which only
 * inspects items already enqueued — before the very last chunk exists in the queue at all, silently
 * dropping it from the finalized recording. attachRecorder() now tracks every ondataavailable
 * handler's promise and awaits all of them before draining.
 */

const appendMock = vi.fn<(id: string, kind: string, base64: string, checksum: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({
  ipc: {
    communicationAppendRecordingChunk: (id: string, kind: string, base64: string, checksum: string) => appendMock(id, kind, base64, checksum),
  },
}));

import { attachRecorder } from './CommunicationAudioCapture';

class FakeMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: FakeBlob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private listeners: Record<string, Array<(event: unknown) => void>> = {};

  constructor(_stream: unknown, _options: unknown) {}

  start(_timeslice: number): void {
    this.state = 'recording';
  }

  pause(): void {
    this.state = 'paused';
  }

  resume(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    // Real MediaRecorder implementations fire 'stop' asynchronously (a macrotask), same as here.
    setTimeout(() => this.onstop?.(), 0);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(listener);
  }
}

class FakeBlob {
  size: number;
  private bytes: Uint8Array;
  private arrayBufferDelayMs: number;

  constructor(bytes: Uint8Array, arrayBufferDelayMs = 0) {
    this.bytes = bytes;
    this.size = bytes.length;
    this.arrayBufferDelayMs = arrayBufferDelayMs;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.arrayBufferDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.arrayBufferDelayMs));
    }
    return this.bytes.buffer as ArrayBuffer;
  }
}

class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsDataURL(blob: FakeBlob): void {
    void (async () => {
      const buf = await blob.arrayBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      this.result = `data:application/octet-stream;base64,${base64}`;
      this.onloadend?.();
    })();
  }
}

beforeEach(() => {
  appendMock.mockClear();
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);
  vi.stubGlobal('FileReader', FakeFileReader as unknown as typeof FileReader);
  vi.stubGlobal('crypto', {
    subtle: {
      digest: async (_alg: string, buf: ArrayBuffer) => {
        // Not a real SHA-256 — deterministic enough for this test, which only asserts delivery
        // ordering/completeness, never checksum correctness (that's covered in the main-process tests).
        return new Uint8Array(Buffer.from(buf)).buffer;
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('attachRecorder — final-chunk race fix', () => {
  it('stop() waits for the final dataavailable chunk to be enqueued and sent, even when its own async processing is still in flight when onstop fires', async () => {
    const recorderResult = attachRecorder('comm-1', 'audio', {} as MediaStream, 'audio/webm', () => {});

    // A normal, fast chunk.
    recorderResult.recorder.ondataavailable?.({ data: new FakeBlob(new Uint8Array([1, 2, 3])) } as never);
    // The FINAL chunk — deliberately slow (its arrayBuffer()/digest/base64 chain takes longer than
    // the macrotask delay MediaRecorder uses to fire 'onstop').
    recorderResult.recorder.ondataavailable?.({ data: new FakeBlob(new Uint8Array([9, 9, 9]), 20) } as never);

    await recorderResult.stop();

    // If the race were unfixed, stop() could resolve after only the first chunk was sent — the
    // second (final) call would never have happened yet.
    expect(appendMock).toHaveBeenCalledTimes(2);
  });

  it('the final chunk\'s bytes are actually delivered (never silently dropped) once stop() resolves', async () => {
    const recorderResult = attachRecorder('comm-2', 'audio', {} as MediaStream, 'audio/webm', () => {});
    recorderResult.recorder.ondataavailable?.({ data: new FakeBlob(new Uint8Array([42, 42]), 15) } as never);

    await recorderResult.stop();

    const lastCall = appendMock.mock.calls.at(-1);
    expect(lastCall?.[2]).toBe(Buffer.from(new Uint8Array([42, 42])).toString('base64'));
  });
});
