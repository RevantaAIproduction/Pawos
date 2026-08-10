import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { platformEventBus } from '../events/PlatformEventBus';
import type { PlatformRuntimeName, RuntimeEvent } from '../events/PlatformEventTypes';

const FILE_NAME = 'platform-health-events.json';
const MAX_ENTRIES = 500;

/**
 * The Health Monitoring Framework's local ring buffer — same persistence
 * shape as ErrorMemoryStore.ts/ExecutionMemoryStore.ts (flat JSON under
 * userData, capped entry count, synchronous load/save). Subscribes to
 * every event Platform Event Bus (Phase 1) reports and persists it.
 *
 * Per the frozen architecture (§6a, §11): this is intentionally local-only
 * and never read by any user-facing code path — it is the raw material a
 * future Incident Detection Engine (Phase 3) will read, not something any
 * customer or even a Platform Administrator queries directly (a redacted
 * summary is what eventually reaches `platform_incidents`, not this raw
 * buffer). Read methods are exposed now, unconsumed, per the same
 * "ship the interface now, the consumer comes later" precedent already
 * established for `TypeScriptLanguageProvider`'s route/syntax methods and
 * `RepositorySemanticIndexService`'s query methods in Coding Runtime V2.
 */
class PlatformHealthStore {
  private filePath = '';
  private events: RuntimeEvent[] = [];
  private unsubscribe: (() => void) | null = null;

  /** Loads persisted events and starts recording every future bus event. */
  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
    this.unsubscribe = platformEventBus.onRuntimeEvent((event) => this.record(event));
  }

  /** Stops recording and drops the store's own bus subscription — test teardown only. */
  stopListening(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.events = Array.isArray(parsed.events) ? parsed.events : [];
    } catch {
      this.events = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ events: this.events }, null, 2), 'utf-8');
  }

  private record(event: RuntimeEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_ENTRIES) this.events = this.events.slice(-MAX_ENTRIES);
    this.save();
  }

  /** Most recent events first. */
  list(limit = 100): RuntimeEvent[] {
    return this.events.slice(-limit).reverse();
  }

  listByRuntime(runtime: PlatformRuntimeName, limit = 100): RuntimeEvent[] {
    return this.events
      .filter((e) => e.runtime === runtime)
      .slice(-limit)
      .reverse();
  }

  listByKind(kind: RuntimeEvent['kind'], limit = 100): RuntimeEvent[] {
    return this.events
      .filter((e) => e.kind === kind)
      .slice(-limit)
      .reverse();
  }
}

export const platformHealthStore = new PlatformHealthStore();
