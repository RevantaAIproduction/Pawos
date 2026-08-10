import { describe, expect, it, vi } from 'vitest';
import { CommunicationUploadQueue, type UploadQueueItem } from './CommunicationUploadQueue';

function item(seq: number): UploadQueueItem {
  return { seq, kind: 'audio', base64Chunk: `chunk-${seq}`, checksum: `sum-${seq}` };
}

describe('CommunicationUploadQueue', () => {
  it('sends a single enqueued item and reports idle once drained', async () => {
    const sendChunk = vi.fn().mockResolvedValue({ ok: true });
    const queue = new CommunicationUploadQueue({ sendChunk });
    queue.enqueue(item(0));
    await queue.waitForDrain();
    expect(sendChunk).toHaveBeenCalledTimes(1);
    expect(sendChunk).toHaveBeenCalledWith(item(0));
    expect(queue.getStatus()).toBe('idle');
    expect(queue.pendingCount()).toBe(0);
  });

  it('processes multiple items strictly in enqueue order — never out of order, never concurrently', async () => {
    const order: number[] = [];
    const sendChunk = vi.fn().mockImplementation(async (i: UploadQueueItem) => {
      order.push(i.seq);
      return { ok: true };
    });
    const queue = new CommunicationUploadQueue({ sendChunk });
    queue.enqueue(item(0));
    queue.enqueue(item(1));
    queue.enqueue(item(2));
    await queue.waitForDrain();
    expect(order).toEqual([0, 1, 2]);
  });

  it('retries a failed chunk with backoff rather than dropping it or skipping ahead', async () => {
    let attempts = 0;
    const sendChunk = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) return { ok: false, message: 'transient' };
      return { ok: true };
    });
    const queue = new CommunicationUploadQueue({ sendChunk, baseRetryDelayMs: 1 });
    queue.enqueue(item(0));
    await queue.waitForDrain();
    expect(attempts).toBe(3);
    expect(queue.getStatus()).toBe('idle');
  });

  it('a failed chunk blocks every chunk enqueued after it — never skips ahead to preserve append order', async () => {
    const order: number[] = [];
    let firstAttempt = true;
    const sendChunk = vi.fn().mockImplementation(async (i: UploadQueueItem) => {
      if (i.seq === 0 && firstAttempt) {
        firstAttempt = false;
        return { ok: false, message: 'transient' };
      }
      order.push(i.seq);
      return { ok: true };
    });
    const queue = new CommunicationUploadQueue({ sendChunk, baseRetryDelayMs: 1 });
    queue.enqueue(item(0));
    queue.enqueue(item(1));
    await queue.waitForDrain();
    expect(order).toEqual([0, 1]); // item 1 never sent before item 0 succeeded
  });

  it('transitions to "failed" only after exhausting maxRetries, and never drops the item', async () => {
    const sendChunk = vi.fn().mockResolvedValue({ ok: false, message: 'permanent failure' });
    const queue = new CommunicationUploadQueue({ sendChunk, maxRetries: 2, baseRetryDelayMs: 1 });
    queue.enqueue(item(0));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(queue.getStatus()).toBe('failed');
    expect(queue.pendingCount()).toBe(1); // still queued, not silently discarded
  });

  it('retry() re-arms processing of a failed item and can succeed', async () => {
    let shouldFail = true;
    const sendChunk = vi.fn().mockImplementation(async () => (shouldFail ? { ok: false } : { ok: true }));
    const queue = new CommunicationUploadQueue({ sendChunk, maxRetries: 1, baseRetryDelayMs: 1 });
    queue.enqueue(item(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queue.getStatus()).toBe('failed');

    shouldFail = false;
    queue.retry();
    await queue.waitForDrain();
    expect(queue.getStatus()).toBe('idle');
    expect(queue.pendingCount()).toBe(0);
  });

  it('pause() stops processing new items; resume() continues from where it left off', async () => {
    const sendChunk = vi.fn().mockResolvedValue({ ok: true });
    const queue = new CommunicationUploadQueue({ sendChunk });
    queue.pause();
    queue.enqueue(item(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendChunk).not.toHaveBeenCalled();
    expect(queue.getStatus()).toBe('paused');

    queue.resume();
    await queue.waitForDrain();
    expect(sendChunk).toHaveBeenCalledTimes(1);
  });

  it('a thrown rejection from sendChunk is treated as a failure, not an uncaught exception', async () => {
    let attempts = 0;
    const sendChunk = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('network down');
      return { ok: true };
    });
    const queue = new CommunicationUploadQueue({ sendChunk, baseRetryDelayMs: 1 });
    queue.enqueue(item(0));
    await queue.waitForDrain();
    expect(attempts).toBe(2);
  });

  it('waitForDrain resolves immediately for an already-empty, idle queue', async () => {
    const queue = new CommunicationUploadQueue({ sendChunk: vi.fn() });
    await expect(queue.waitForDrain()).resolves.toBeUndefined();
  });
});
