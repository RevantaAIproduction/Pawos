import { v4 as uuidv4 } from 'uuid';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { QueuedActionState } from '../../shared/actions/ExecutionRecordTypes';

export type QueuedAction = {
  id: string;
  request: ActionRequest;
  state: QueuedActionState;
  enqueuedAt: number;
};

/**
 * Guarantees deterministic, one-at-a-time execution of actions within one
 * execution — the queue never decides WHAT runs (the LLM does, via tool
 * calls); it only guarantees the ORDER those calls actually execute in,
 * closing the race where multiple tool calls in one streamed response could
 * otherwise run concurrently. Internal only — users never see queue
 * mechanics, only their effects (live narration, the eventual Work History
 * timeline).
 */
export class ExecutionQueue {
  private items: QueuedAction[] = [];
  private tail: Promise<void> = Promise.resolve();
  private paused = false;

  /** Runs fn() in queue order, one at a time. The caller mutates item.state as it actually learns more (running/observing/verifying/recovering/completed/failed) — this class only owns ordering, not the real lifecycle detail. */
  runExclusive<T>(request: ActionRequest, fn: (item: QueuedAction) => Promise<T>): Promise<T> {
    const item: QueuedAction = { id: uuidv4(), request, state: 'queued', enqueuedAt: Date.now() };
    this.items.push(item);

    const run = this.tail.then(async () => {
      while (this.paused) await new Promise((resolve) => setTimeout(resolve, 100));
      if (item.state === 'cancelled') throw new Error('Action was cancelled before it started.');
      item.state = 'preparing';
      try {
        return await fn(item);
      } catch (error) {
        item.state = 'failed';
        throw error;
      }
    });
    // Keep the chain alive even if this run rejects, so later items still get their turn.
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** Only a not-yet-started item can be cancelled — a running one can't be safely interrupted mid-OS-call. */
  cancel(id: string): boolean {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.state !== 'queued') return false;
    item.state = 'cancelled';
    return true;
  }

  list(): QueuedAction[] {
    return [...this.items];
  }
}
