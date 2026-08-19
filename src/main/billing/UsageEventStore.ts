import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const FILE_NAME = 'usage-events.json';
/** Larger than CreditStore's 200-entry consumption-summary history — this is meant to be a genuine
 *  per-request transparency ledger (the Usage Details view's real data source), not just a coarse
 *  activity feed. */
const MAX_ENTRIES = 2000;

type State = {
  records: NormalizedUsageRecord[];
};

function freshState(): State {
  return { records: [] };
}

/**
 * Append-only ledger of real, normalized usage events — one entry per real model request (never per
 * turn; a turn with tool-calling continuations produces multiple entries, see UsageMeteringEngine.ts).
 * A past record is never mutated once written; the only maintenance operation is capacity eviction
 * (oldest-first), matching the append-only/auditable requirement for the canonical usage event.
 */
class UsageEventStore {
  private file = '';
  private state: State = freshState();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const persisted = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<State>;
      this.state = { records: Array.isArray(persisted.records) ? persisted.records : [] };
    } catch {
      this.state = freshState();
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  /** Appends one already-normalized record — normalization itself happens in UsageMeteringEngine.ts,
   *  never here; this store only persists what it's given. */
  append(record: NormalizedUsageRecord): void {
    this.state.records.push(record);
    if (this.state.records.length > MAX_ENTRIES) {
      this.state.records = this.state.records.slice(-MAX_ENTRIES);
    }
    this.save();
  }

  /** Most-recent-first, optionally capped — the real data source for a future Usage Details view. */
  list(limit?: number): NormalizedUsageRecord[] {
    const ordered = [...this.state.records].reverse();
    return typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
  }

  /** The idempotency lookup UsageMeteringEngine.recordUsageEvent() uses before ever appending a new
   *  record — a real match here means this exact real Gemini request (by PawOS's own per-request
   *  identity, see ProviderUsageMetadata's doc comment) was already durably recorded, so the caller
   *  should reuse this record rather than create a second one. Never matches on a null requestId,
   *  since null carries no real identity to deduplicate against. Bounded by the same MAX_ENTRIES the
   *  ledger already caps at — a request old enough to have been evicted is treated as new, an
   *  accepted, disclosed edge of the existing eviction policy, not a new gap this method introduces. */
  findByRequestId(requestId: string): NormalizedUsageRecord | undefined {
    return this.state.records.find((r) => r.requestId === requestId);
  }
}

export const usageEventStore = new UsageEventStore();
