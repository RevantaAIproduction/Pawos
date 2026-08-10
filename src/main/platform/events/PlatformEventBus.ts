import { randomUUID } from 'crypto';
import type { RuntimeEvent, RuntimeEventInput } from './PlatformEventTypes';

/**
 * The Platform Runtime's event reporting mechanism.
 *
 * Per the frozen "Platform Runtime — Final Architecture Review" (§3, Event
 * architecture assessment): PawOS has no existing centralized/shared event
 * bus anywhere in the codebase (DesktopExecutionEngine's own EventEmitter is
 * instance-scoped to one task's progress events; the two renderer
 * EventEmitter<T> utility classes are each instantiated locally per feature).
 * Building a sweeping shared bus object every runtime holds a reference to
 * would be a new architectural paradigm with no precedent. Instead, this is
 * one additive module, following the same "local emitter instance behind a
 * small typed API" shape already proven in this codebase, that every runtime
 * calls directly at its own existing failure/exception boundary — no runtime
 * needs to import or hold a reference to any shared object beyond this
 * module's exported singleton.
 *
 * Scope of this phase: pub/sub only. No persistence, no ring buffer — that is
 * the Health Monitoring Framework's job (Phase 2), which subscribes here to
 * build its own bounded local store.
 */

type RuntimeEventListener = (event: RuntimeEvent) => void;

class PlatformEventBus {
  private listeners = new Set<RuntimeEventListener>();

  /**
   * Reports a runtime event. Callers never supply `id`/`timestamp` — both are
   * assigned here so every event is uniquely and consistently identified
   * regardless of caller.
   *
   * Dispatch guarantees (verified 2026-08-02, see plan doc Phase 1 final
   * verification):
   * - The event object is frozen before dispatch, so no listener can mutate
   *   it and affect what a later listener (or the original caller) observes.
   * - The listener set is snapshotted into an array before iterating, so a
   *   listener that subscribes/unsubscribes another listener mid-dispatch
   *   never changes who receives *this* event — it only affects future
   *   dispatches. This also makes re-entrant calls (a listener synchronously
   *   calling reportRuntimeEvent again) safe: each call snapshots its own
   *   independent array, so a nested dispatch cannot corrupt the outer one.
   * - A listener exception is caught and logged with the full event's
   *   diagnostic context (runtime, kind, id) plus the error itself, then
   *   dispatch continues to the next listener without rethrowing: this is
   *   called from arbitrary runtimes' own failure/exception boundaries (per
   *   the "silent by construction" guiding principle), so a bug in one
   *   subscriber must never stop delivery to other subscribers, and must
   *   never propagate into — let alone crash — whichever runtime was simply
   *   trying to report its own event.
   */
  reportRuntimeEvent(input: RuntimeEventInput): RuntimeEvent {
    const event = Object.freeze({
      ...input,
      id: randomUUID(),
      timestamp: Date.now(),
    }) as RuntimeEvent;

    const snapshot = Array.from(this.listeners);
    for (const listener of snapshot) {
      try {
        listener(event);
      } catch (error) {
        console.error(
          `[PlatformEventBus] listener threw while handling a "${event.kind}" event from runtime "${event.runtime}" (event id: ${event.id})`,
          error,
        );
      }
    }

    return event;
  }

  /** Subscribes to every reported event. Returns an unsubscribe function. */
  onRuntimeEvent(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Removes every subscribed listener. For test teardown and any future
   * explicit Platform Runtime shutdown path — this module holds no timers or
   * other external resources, so dropping listener references is the entire
   * shutdown surface.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Exposed for tests only — not part of the runtime-facing API surface. */
  listenerCount(): number {
    return this.listeners.size;
  }
}

/** Single shared instance — the one thing every runtime's emission call imports. */
export const platformEventBus = new PlatformEventBus();

export type { RuntimeEventListener };
