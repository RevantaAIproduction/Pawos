import type { NormalizedConnectivityEvent } from '../../shared/connectivity/ConnectivityTypes';

/**
 * In-process pub/sub for already-normalized connectivity events — the seam
 * a future Webhook Manager → Event Bus → `desktopExecutionEngine.execute(...)`
 * chain will use once a real connector and a real subscriber exist.
 * Deliberately simple: no queue, no persistence, no replay — nothing
 * publishes to it yet this phase besides a verification script.
 */
class EventBus {
  private handlers = new Map<string, Set<(event: NormalizedConnectivityEvent) => void>>();

  publish(event: NormalizedConnectivityEvent): void {
    const set = this.handlers.get(event.event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) handler(event);
  }

  subscribe(eventType: string, handler: (event: NormalizedConnectivityEvent) => void): () => void {
    let set = this.handlers.get(eventType);
    if (!set) {
      set = new Set();
      this.handlers.set(eventType, set);
    }
    set.add(handler);
    return () => {
      const current = this.handlers.get(eventType);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.handlers.delete(eventType);
    };
  }
}

export const connectivityEventBus = new EventBus();
