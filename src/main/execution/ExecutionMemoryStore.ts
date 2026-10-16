import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { isTerminalExecutionStatus } from '../../shared/actions/ExecutionRecordTypes';

const FILE_NAME = 'execution-history.json';
/** Bounds unbounded growth over the app's lifetime — oldest records drop off first. */
const MAX_RECORDS = 500;

/**
 * Dumb persistence for ExecutionRecords, same JSON-in-userData singleton
 * pattern as ConversationSessionStore/WorkspaceMemoryStore/ErrorMemoryStore.
 * All the real bookkeeping (accumulating a record while an execution is in
 * flight) happens in the renderer's ExecutionSupervisor — this store only
 * ever receives one already-finished record per write.
 */
export class ExecutionMemoryStore {
  private filePath = '';
  private records: ExecutionRecord[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
    if (this.reconcileInterrupted() > 0) this.save();
  }

  /** For tests: a store backed by a given file, without Electron's app paths. */
  initAt(filePath: string): void {
    this.filePath = filePath;
    this.load();
    if (this.reconcileInterrupted() > 0) this.save();
  }

  /**
   * Startup reconciliation. No execution survives PawOS closing (actions run in this process and the
   * window's runtime), so anything still 'in_progress' or 'cancelling' at launch was cut off by the
   * app closing or crashing. It becomes 'interrupted' — never completed or failed, which nothing
   * established. Returns how many records changed.
   */
  reconcileInterrupted(): number {
    let changed = 0;
    this.records = this.records.map((record) => {
      if (record.status !== 'in_progress' && record.status !== 'cancelling' && record.status !== 'awaiting_approval') return record;
      changed += 1;
      return {
        ...record,
        status: 'interrupted',
        stoppedReason: record.stoppedReason ?? 'PawOS closed before this task finished. Nothing after the last recorded step is known.',
        currentOperation: null,
        completedAt: record.completedAt ?? record.lastActivityAt ?? record.startedAt,
        durationMs: record.durationMs ?? Math.max(0, (record.lastActivityAt ?? record.startedAt) - record.startedAt),
        revision: (record.revision ?? 0) + 1,
        nextAction: record.nextAction ?? 'Review the changes made so far and ask PawOS to continue if needed.',
      };
    });
    return changed;
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.records = Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      this.records = [];
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ records: this.records }, null, 2), 'utf-8');
  }

  /**
   * Upserts one record. Returns false (and changes nothing) for a stale write: a lower revision than
   * the one stored (late / out-of-order IPC delivery), or any write that would move a finished record
   * back to running. A cancellation confirmation on a 'cancelling' → 'cancelled' record still lands.
   */
  record(incoming: ExecutionRecord, accountId: string | null = null): boolean {
    // The owner is the verified signed-in account (set by the main process, never by the renderer).
    const { userId: _claimed, ...rest } = incoming;
    void _claimed;
    const entry: ExecutionRecord = accountId ? { ...rest, userId: accountId } : rest;
    const existingIndex = this.records.findIndex((record) => record.id === entry.id);
    const existing = existingIndex >= 0 ? this.records[existingIndex] : undefined;
    if (existing) {
      // Never overwrite a record that belongs to another account (or move one between accounts).
      if ((existing.userId ?? null) !== (entry.userId ?? null)) return false;
      if ((entry.revision ?? 0) < (existing.revision ?? 0)) return false;
      if (isTerminalExecutionStatus(existing.status) && !isTerminalExecutionStatus(entry.status)) return false;
      this.records[existingIndex] = entry;
    } else {
      this.records.push(entry);
    }
    if (this.records.length > MAX_RECORDS) this.records = this.records.slice(-MAX_RECORDS);
    this.save();
    return true;
  }

  /** One record, only if it belongs to `accountId` (records without an account are never returned). */
  get(id: string, accountId: string | null): ExecutionRecord | undefined {
    if (!accountId) return undefined;
    return this.records.find((record) => record.id === id && record.userId === accountId);
  }

  /** The account's own records, newest first. No account (signed out / unverified) → none. */
  list(accountId: string | null): ExecutionRecord[] {
    if (!accountId) return [];
    return this.records.filter((record) => record.userId === accountId).sort((a, b) => b.startedAt - a.startedAt);
  }
}

export const executionMemoryStore = new ExecutionMemoryStore();
