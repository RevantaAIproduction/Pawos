import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

const FILE_NAME = 'memory-graph.json';

/**
 * Open string, not a closed union — new runtimes add entity types without
 * ever touching this file. 'workspace' | 'file' | 'person' | 'client' |
 * 'company' | 'meeting' | 'conversation' | 'task' | 'email' |
 * 'learningTopic' | 'project' | 'healthRecord' | 'reminder' |
 * 'appointment' | ... (future runtimes add their own).
 */
export type EntityType = string;

/**
 * Open vocabulary too — see relationVocabulary.ts for the shared named
 * constants every runtime should import instead of inventing synonyms.
 */
export type Relation = string;

export type EvidenceSource = 'fileContent' | 'userAction' | 'conversation' | 'taskExecution' | 'userConfirmation';

export type EvidenceItem = {
  source: EvidenceSource;
  /** Concrete and specific, e.g. "mentions client 'ABC Industries' in the document text". */
  detail: string;
  /** Pointer to the concrete source: file path, task id, conversation turn id, entity/edge id. */
  refId?: string;
};

/**
 * Attached to any entity/edge Paw inferred rather than the user stating
 * directly. Absent entirely = certain/user-provided, nothing to justify.
 * reasoningSummary is ALWAYS synthesized by joining evidence[].detail
 * (see buildReasoningSummary below) — never a raw pass-through of
 * free-form LLM prose, so what's shown to the user is guaranteed backed
 * by what's actually stored.
 */
export type Inference = {
  confidence: number;
  evidence: EvidenceItem[];
  reasoningSummary: string;
};

export type EntityVersionEvent = {
  version: number;
  changeType: 'created' | 'modified' | 'renamed' | 'moved' | 'deleted' | 'restored';
  changeDetail?: string;
  attributesSnapshot?: Record<string, unknown>;
  recordedAt: number;
};

export type Entity = {
  id: string;
  type: EntityType;
  attributes: Record<string, unknown>;
  inference?: Inference;
  /** Future-facing only — unset today, no current code reads it; exists so a later multi-user/sharing feature never needs a migration. */
  visibility?: 'private' | 'family' | 'workspace' | 'team' | 'public';
  version: number;
  history: EntityVersionEvent[];
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
};

export type Edge = {
  id: string;
  fromId: string;
  fromType: EntityType;
  toId: string;
  toType: EntityType;
  relation: Relation;
  inference?: Inference;
  createdAt: number;
  /** Append-only: superseded via active:false, never deleted — full history for free. */
  active: boolean;
};

export function buildReasoningSummary(evidence: EvidenceItem[]): string {
  if (evidence.length === 0) return '';
  return evidence.map((e) => e.detail).join('; ') + '.';
}

/**
 * Paw's generic, provenance-aware long-term memory graph — deliberately
 * NOT file-runtime-shaped. File Runtime is the first consumer (via
 * entities/fileEntities.ts, entities/workspaceEntities.ts); every future
 * runtime (Browser, Office, Communication, Cloud, Health, ...) writes into
 * this exact same store through its own typed wrapper, never by touching
 * this file. Same singleton/JSON/userData persistence pattern as
 * WorkspaceMemoryStore/ConversationSessionStore/ExecutionMemoryStore/
 * ErrorMemoryStore.
 *
 * Every method here operates on a single entity/edge id or a bounded
 * query — there is no "rebuild" method in this API surface at all, by
 * design: incremental callers (see fileEntities.ts's onFileMoved/
 * onFileModified/etc.) touch only what actually changed.
 */
class MemoryGraphStore {
  private filePath = '';
  private entities = new Map<string, Entity>();
  private edges = new Map<string, Edge>();

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const entities: Entity[] = Array.isArray(parsed.entities) ? parsed.entities : [];
      const edges: Edge[] = Array.isArray(parsed.edges) ? parsed.edges : [];
      this.entities = new Map(entities.map((e) => [e.id, e]));
      this.edges = new Map(edges.map((e) => [e.id, e]));
    } catch {
      this.entities = new Map();
      this.edges = new Map();
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload = { entities: [...this.entities.values()], edges: [...this.edges.values()] };
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  /** Creates (id omitted) or updates (id given) an entity — always bumps version and appends one EntityVersionEvent, never overwrites history. */
  upsertEntity(
    type: EntityType,
    attributes: Record<string, unknown>,
    options?: { id?: string; inference?: Inference; changeType?: EntityVersionEvent['changeType']; changeDetail?: string }
  ): Entity {
    const now = Date.now();
    const existing = options?.id ? this.entities.get(options.id) : undefined;

    if (existing) {
      const version = existing.version + 1;
      const changeType = options?.changeType ?? 'modified';
      existing.attributes = attributes;
      existing.inference = options?.inference ?? existing.inference;
      existing.version = version;
      existing.updatedAt = now;
      existing.history = [
        ...existing.history,
        { version, changeType, changeDetail: options?.changeDetail, attributesSnapshot: attributes, recordedAt: now },
      ];
      this.entities.set(existing.id, existing);
      this.save();
      return existing;
    }

    const id = options?.id ?? uuidv4();
    const entity: Entity = {
      id,
      type,
      attributes,
      inference: options?.inference,
      version: 1,
      history: [{ version: 1, changeType: options?.changeType ?? 'created', changeDetail: options?.changeDetail, attributesSnapshot: attributes, recordedAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    this.entities.set(id, entity);
    this.save();
    return entity;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getEntityAtVersion(id: string, version: number): EntityVersionEvent | undefined {
    return this.entities.get(id)?.history.find((h) => h.version === version);
  }

  queryEntities(filter?: { type?: EntityType; where?: (attributes: Record<string, unknown>) => boolean }): Entity[] {
    return [...this.entities.values()].filter((e) => {
      if (filter?.type && e.type !== filter.type) return false;
      if (filter?.where && !filter.where(e.attributes)) return false;
      return true;
    });
  }

  touchLastUsed(id: string): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.lastUsedAt = Date.now();
    this.save();
  }

  deleteEntity(id: string): void {
    this.entities.delete(id);
    this.save();
  }

  link(fromId: string, toId: string, relation: Relation, inference?: Inference): Edge {
    const from = this.entities.get(fromId);
    const to = this.entities.get(toId);
    const edge: Edge = {
      id: uuidv4(),
      fromId,
      fromType: from?.type ?? 'unknown',
      toId,
      toType: to?.type ?? 'unknown',
      relation,
      inference,
      createdAt: Date.now(),
      active: true,
    };
    this.edges.set(edge.id, edge);
    this.save();
    return edge;
  }

  /** Marks an edge inactive instead of deleting it — the append-only precedent that makes edge history free. */
  supersede(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    edge.active = false;
    this.save();
  }

  /** The symmetric counterpart to supersede() — restoring an entity (e.g. undoing a delete) reactivates its prior edges instead of fabricating new ones with a fresh history. */
  reactivate(edgeId: string): void {
    const edge = this.edges.get(edgeId);
    if (!edge) return;
    edge.active = true;
    this.save();
  }

  /** All edges (either direction), active or not — used to find what to reactivate on restore. */
  getAllEdgesFor(id: string): Edge[] {
    return [...this.edges.values()].filter((e) => e.fromId === id || e.toId === id);
  }

  getRelated(id: string, relation?: Relation, toType?: EntityType): Entity[] {
    const matches = [...this.edges.values()].filter(
      (e) => e.active && e.fromId === id && (!relation || e.relation === relation) && (!toType || e.toType === toType)
    );
    return matches.map((e) => this.entities.get(e.toId)).filter((e): e is Entity => Boolean(e));
  }

  /** Every edge ever touching this entity (either direction), active or not, ordered by createdAt — "how did this evolve"/"when did I last work on this." */
  getEntityHistory(id: string): Edge[] {
    return [...this.edges.values()]
      .filter((e) => e.fromId === id || e.toId === id)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Bounded recursive walk of active edges — "what meeting created this document" / "what did this produce downstream." */
  getProvenanceChain(id: string, direction: 'from' | 'to', maxDepth = 5): Edge[] {
    const result: Edge[] = [];
    const visited = new Set<string>();

    const walk = (currentId: string, depth: number) => {
      if (depth > maxDepth || visited.has(currentId)) return;
      visited.add(currentId);
      const matches = [...this.edges.values()].filter((e) => e.active && (direction === 'from' ? e.fromId === currentId : e.toId === currentId));
      for (const edge of matches) {
        result.push(edge);
        walk(direction === 'from' ? edge.toId : edge.fromId, depth + 1);
      }
    };

    walk(id, 0);
    return result;
  }

  /** Returns the stored Inference verbatim — the API surface behind "why do you think that." */
  explain(entityOrEdgeId: string): Inference | undefined {
    return this.entities.get(entityOrEdgeId)?.inference ?? this.edges.get(entityOrEdgeId)?.inference;
  }

  /** Substring match across attributes' string values — same house style as ConversationSessionStore.search() today, upgradeable later without an API break since callers never touch the JSON directly. */
  search(text: string, type?: EntityType): Entity[] {
    const lower = text.toLowerCase();
    return [...this.entities.values()].filter((e) => {
      if (type && e.type !== type) return false;
      return Object.values(e.attributes).some((v) => typeof v === 'string' && v.toLowerCase().includes(lower));
    });
  }
}

export const memoryGraphStore = new MemoryGraphStore();
