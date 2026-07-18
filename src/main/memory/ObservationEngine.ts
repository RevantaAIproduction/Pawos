import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import type { EvidenceItem } from './MemoryGraphStore';

const FILE_NAME = 'observations.json';

export type Observation = {
  id: string;
  kind: string;
  text: string;
  entityRefs: string[];
  basis: EvidenceItem[];
  computedAt: number;
  expiresAt?: number;
};

/**
 * The Memory Graph stores truth; this stores opinions — kept deliberately
 * separate so the graph itself never gets polluted with anything that
 * could go stale in a way that corrupts a fact. An Observation can be
 * wrong or outdated and simply expires; unlike an Entity, it's never
 * appended to a permanent history, just recomputed or dropped. Same
 * singleton/JSON/userData persistence pattern as the other stores, but
 * explicitly disposable.
 */
class ObservationEngine {
  private filePath = '';
  private observations = new Map<string, Observation>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const records: Observation[] = Array.isArray(parsed.observations) ? parsed.observations : [];
      this.observations = new Map(records.map((o) => [o.id, o]));
    } catch {
      this.observations = new Map();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ observations: [...this.observations.values()] }, null, 2), 'utf-8');
  }

  record(kind: string, text: string, entityRefs: string[], basis: EvidenceItem[], ttlMs?: number): Observation {
    const observation: Observation = {
      id: uuidv4(),
      kind,
      text,
      entityRefs,
      basis,
      computedAt: Date.now(),
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    };
    this.observations.set(observation.id, observation);
    this.save();
    return observation;
  }

  /** Replaces every observation of a given kind — used by an observer that recomputes its whole result set each run rather than incrementally patching individual observations. */
  replaceKind(kind: string, next: Omit<Observation, 'id' | 'computedAt' | 'expiresAt'>[], ttlMs?: number): Observation[] {
    for (const [id, obs] of this.observations) {
      if (obs.kind === kind) this.observations.delete(id);
    }
    const now = Date.now();
    const created = next.map((o) => {
      const observation: Observation = { ...o, id: uuidv4(), computedAt: now, expiresAt: ttlMs ? now + ttlMs : undefined };
      this.observations.set(observation.id, observation);
      return observation;
    });
    this.save();
    return created;
  }

  get(filter?: { entityRef?: string; kind?: string }): Observation[] {
    const now = Date.now();
    return [...this.observations.values()].filter((o) => {
      if (o.expiresAt && o.expiresAt < now) return false;
      if (filter?.kind && o.kind !== filter.kind) return false;
      if (filter?.entityRef && !o.entityRefs.includes(filter.entityRef)) return false;
      return true;
    });
  }
}

export const observationEngine = new ObservationEngine();
