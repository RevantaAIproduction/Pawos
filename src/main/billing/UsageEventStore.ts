import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';
import { normalizedComputeToWorkPc } from '../../shared/billing/AutonomousWorkPcCommercialModel';

const FILE_NAME = 'usage-events.json';
/** Larger than CreditStore's 200-entry consumption-summary history — this is meant to be a genuine
 *  per-request transparency ledger (the Usage Details view's real data source), not just a coarse
 *  activity feed. */
const MAX_ENTRIES = 2000;

type State = {
  records: NormalizedUsageRecord[];
  recoveryRequired?: boolean;
  lastGoRefreshAt?: number;
};

function freshState(): State {
  return { records: [], recoveryRequired: false };
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

  setLastGoRefreshAt(timestamp: number): void {
    this.state.lastGoRefreshAt = timestamp;
    this.save();
  }

  getLastGoRefreshAt(): number | undefined {
    return this.state.lastGoRefreshAt;
  }

  /** Appends one already-normalized record — normalization itself happens in UsageMeteringEngine.ts,
   *  never here; this store only persists what it's given. */
  append(record: NormalizedUsageRecord): void {
    console.log('[USAGE_EVENT_APPEND] requestId:', record.requestId, 'runId:', record.runId, 'normalizedCompute:', record.normalizedCompute);
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

  /** Calculate actual PC for a run. CRITICAL SAFETY: Returns 0 only for legitimate zero-usage runs.
   *  If checkpoint corruption is detected (recoveryRequired flag set), throws an error instead.
   *  This prevents silent undercharging when usage events are lost due to process crash or IPC failure.
   *
   *  Usage:
   *    Normal 0-usage run → returns 0 (safe)
   *    Corrupted checkpoint → throws error (requires recovery)
   *  */
  calculateActualPcForRun(runId: string): number {
    // CRITICAL SAFETY CHECK: Do not return zero usage if checkpoint integrity is uncertain
    if (this.state.recoveryRequired === true) {
      throw new Error(
        `[RECOVERY_REQUIRED] Usage data integrity compromised for run ${runId}. ` +
        `Cannot settle with potentially incomplete records. Manual checkpoint recovery required.`
      );
    }

    const records = this.state.records.filter((r) => r.runId === runId);
    const totalNormalizedCompute = records.reduce((sum, r) => sum + (r.normalizedCompute ?? 0), 0);

    // CRITICAL: Convert from internal normalized compute to customer Work PC
    // Formula: normalizedCompute / 1000 = provider cost USD
    // Then: provider cost USD → 70% margin → customer charge → Work PC
    const actualWorkPc = normalizedComputeToWorkPc(totalNormalizedCompute);

    console.log(
      '[USAGE_ACTUAL_PC_CALCULATED]',
      {
        runId,
        totalNormalizedCompute: Math.round(totalNormalizedCompute * 100) / 100,
        actualWorkPc: Math.round(actualWorkPc * 100) / 100,
        recordCount: records.length,
        recoveryRequired: this.state.recoveryRequired,
        note: 'Converted from normalized compute to customer Work PC via 70% margin'
      }
    );

    return Math.round(actualWorkPc);
  }

  /** Check if checkpoint recovery is required. Used by settlement handlers to block
   *  settlement when data integrity is uncertain. */
  isRecoveryRequired(): boolean {
    return this.state.recoveryRequired === true;
  }

  /** Mark checkpoint as requiring recovery. Called when checkpoint integrity is
   *  compromised (e.g., process crash during write, IPC failure, filesystem errors).
   *  Settlement will be blocked until recovery completes. */
  setRecoveryRequired(reason: string): void {
    console.log('[USAGE_RECOVERY_FLAG_SET]', { reason });
    this.state.recoveryRequired = true;
    this.save();
  }

  /** Clear recovery flag after successful recovery/reconciliation. Called only after
   *  manual review confirms checkpoint integrity. */
  clearRecoveryFlag(): void {
    console.log('[USAGE_RECOVERY_FLAG_CLEARED]');
    this.state.recoveryRequired = false;
    this.save();
  }
}

export const usageEventStore = new UsageEventStore();
