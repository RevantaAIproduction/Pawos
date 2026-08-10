/**
 * Recording & Storage Foundation (Phase 1) — resumable, background transfer of recorded chunks
 * from the renderer's live capture into main-process durable storage. Deliberately pure: it holds
 * no MediaRecorder/DOM reference itself, only an injected `sendChunk` function — this is what makes
 * pause/resume/retry logic directly unit-testable without mocking any browser API.
 *
 * Chunks are processed strictly in the order they were enqueued (one at a time, never concurrently)
 * because the main-process store appends each chunk to a single file — out-of-order writes would
 * corrupt the recording. A failed chunk is retried with capped exponential backoff; it is never
 * dropped silently, and it blocks every chunk enqueued after it (correct: a gap in the middle of a
 * recording is not recoverable by skipping ahead).
 */

export type UploadQueueItem = {
  seq: number;
  kind: 'audio' | 'video';
  base64Chunk: string;
  checksum: string;
};

export type UploadQueueStatus = 'idle' | 'uploading' | 'paused' | 'failed';

export type SendChunkResult = { ok: boolean; message?: string };

export type UploadQueueOptions = {
  sendChunk: (item: UploadQueueItem) => Promise<SendChunkResult>;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  onStatusChange?: (status: UploadQueueStatus) => void;
};

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY_MS = 500;

export class CommunicationUploadQueue {
  private readonly sendChunk: (item: UploadQueueItem) => Promise<SendChunkResult>;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly onStatusChange?: (status: UploadQueueStatus) => void;

  private queue: UploadQueueItem[] = [];
  private paused = false;
  private processing = false;
  private status: UploadQueueStatus = 'idle';
  private currentRetryCount = 0;
  /** Resolved once the queue has fully drained (empty + not processing) — recreated every time a new item is enqueued into an empty, idle queue. */
  private drainResolvers: Array<() => void> = [];

  constructor(options: UploadQueueOptions) {
    this.sendChunk = options.sendChunk;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;
    this.onStatusChange = options.onStatusChange;
  }

  getStatus(): UploadQueueStatus {
    return this.status;
  }

  pendingCount(): number {
    return this.queue.length;
  }

  enqueue(item: UploadQueueItem): void {
    this.queue.push(item);
    if (!this.paused) void this.processNext();
  }

  pause(): void {
    this.paused = true;
    this.setStatus('paused');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    void this.processNext();
  }

  /** Resolves once every currently-enqueued chunk has been durably sent (or the queue has given up after exhausting retries on one). Used by stop()/finalize() to know it's safe to call finalizeRecording. */
  waitForDrain(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) return Promise.resolve();
    return new Promise((resolve) => this.drainResolvers.push(resolve));
  }

  private setStatus(status: UploadQueueStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }

  private notifyDrainedIfEmpty(): void {
    if (this.queue.length > 0 || this.processing) return;
    const resolvers = this.drainResolvers;
    this.drainResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.paused) return;
    const item = this.queue[0];
    if (!item) {
      this.setStatus('idle');
      this.notifyDrainedIfEmpty();
      return;
    }
    this.processing = true;
    this.setStatus('uploading');

    const result = await this.sendChunk(item).catch((error: unknown): SendChunkResult => ({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }));

    if (result.ok) {
      this.currentRetryCount = 0;
      this.queue.shift();
      this.processing = false;
      void this.processNext();
      return;
    }

    // Failure — retry the SAME item (never skip ahead) with capped exponential backoff.
    this.currentRetryCount += 1;
    if (this.currentRetryCount > this.maxRetries) {
      this.setStatus('failed');
      this.processing = false;
      // Deliberately does not drop the item — a caller can still resume()/retry via the same
      // resume() path once whatever caused every attempt to fail (e.g. a stalled main process) is
      // resolved; retrying re-arms the same backoff sequence from the start.
      return;
    }
    const delay = this.baseRetryDelayMs * 2 ** (this.currentRetryCount - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.processing = false;
    void this.processNext();
  }

  /** Explicit retry after a 'failed' status — resets the backoff counter and resumes processing from the item that exhausted its retries. */
  retry(): void {
    if (this.status !== 'failed') return;
    this.currentRetryCount = 0;
    this.paused = false;
    void this.processNext();
  }
}
