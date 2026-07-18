import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

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
class ExecutionMemoryStore {
  private filePath = '';
  private records: ExecutionRecord[] = [];

  init(): void {
    this.filePath = path.join(app.getPath('userData'), FILE_NAME);
    this.load();
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

  record(entry: ExecutionRecord): void {
    this.records.push(entry);
    if (this.records.length > MAX_RECORDS) this.records = this.records.slice(-MAX_RECORDS);
    this.save();
  }

  list(): ExecutionRecord[] {
    return [...this.records].sort((a, b) => b.startedAt - a.startedAt);
  }
}

export const executionMemoryStore = new ExecutionMemoryStore();
