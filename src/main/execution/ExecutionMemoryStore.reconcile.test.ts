import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));

import { ExecutionMemoryStore } from './ExecutionMemoryStore';

/** Work History persistence: startup reconciliation, and stale / out-of-order writes. Real files in a temp folder. */

const base = (overrides: Partial<ExecutionRecord>): ExecutionRecord => ({
  id: 'rec-1',
  goal: 'Fix the login form',
  status: 'in_progress',
  startedAt: 1_000,
  applicationsUsed: [],
  aiWorkersUsed: [],
  commandsExecuted: [],
  filesCreated: [],
  filesModified: [],
  verificationResults: [],
  recoveryAttempts: 0,
  timeline: [],
  summary: '',
  userId: 'user-A',
  ...overrides,
});

function storeWith(records: ExecutionRecord[]): { store: ExecutionMemoryStore; file: string } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-exec-store-')), 'execution-history.json');
  fs.writeFileSync(file, JSON.stringify({ records }));
  const store = new ExecutionMemoryStore();
  store.initAt(file);
  return { store, file };
}

describe('startup reconciliation', () => {
  it('a record left running (or cancelling) by a closed or crashed PawOS becomes Interrupted — never completed or failed', () => {
    const { store, file } = storeWith([
      base({ id: 'running', status: 'in_progress', lastActivityAt: 5_000, currentOperation: { actionType: 'runCommand', label: 'npm test', startedAt: 4_000 } }),
      base({ id: 'cancelling', status: 'cancelling', cancellation: { requestedAt: 6_000 } }),
      base({ id: 'waiting', status: 'awaiting_approval' }),
      base({ id: 'done', status: 'completed', completedAt: 9_000 }),
      base({ id: 'failed', status: 'failed' }),
    ]);
    const byId = Object.fromEntries(store.list('user-A').map((r) => [r.id, r]));
    expect(byId.running.status).toBe('interrupted');
    expect(byId.running.currentOperation).toBeNull();
    expect(byId.running.completedAt).toBe(5_000);
    expect(byId.running.stoppedReason).toMatch(/PawOS closed before this task finished/);
    expect(byId.cancelling.status).toBe('interrupted');
    expect(byId.waiting.status).toBe('interrupted');
    expect(byId.done.status).toBe('completed');
    expect(byId.failed.status).toBe('failed');
    // Persisted, so a second launch sees the same.
    const saved = JSON.parse(fs.readFileSync(file, 'utf-8')).records as ExecutionRecord[];
    expect(saved.find((r) => r.id === 'running')?.status).toBe('interrupted');
  });

  it('a second launch changes nothing more', () => {
    const { file } = storeWith([base({ id: 'running', status: 'in_progress' })]);
    const again = new ExecutionMemoryStore();
    again.initAt(file);
    expect(again.reconcileInterrupted()).toBe(0);
  });
});

describe('stale and out-of-order writes', () => {
  it('an older revision arriving late changes nothing', () => {
    const { store } = storeWith([]);
    expect(store.record(base({ status: 'in_progress', revision: 3, summary: 'newer' }), 'user-A')).toBe(true);
    expect(store.record(base({ status: 'in_progress', revision: 2, summary: 'older' }), 'user-A')).toBe(false);
    expect(store.get('rec-1', 'user-A')?.summary).toBe('newer');
  });

  it('a duplicate of the same revision is harmless', () => {
    const { store } = storeWith([]);
    store.record(base({ revision: 4, summary: 'same' }), 'user-A');
    expect(store.record(base({ revision: 4, summary: 'same' }), 'user-A')).toBe(true);
    expect(store.list('user-A')).toHaveLength(1);
  });

  it('a finished record can never be moved back to running', () => {
    const { store } = storeWith([]);
    store.record(base({ status: 'completed', revision: 5 }), 'user-A');
    expect(store.record(base({ status: 'in_progress', revision: 9 }), 'user-A')).toBe(false);
    expect(store.get('rec-1', 'user-A')?.status).toBe('completed');
  });

  it('Cancelling → Cancelled lands', () => {
    const { store } = storeWith([]);
    store.record(base({ status: 'cancelling', revision: 5 }), 'user-A');
    expect(store.record(base({ status: 'cancelled', revision: 6 }), 'user-A')).toBe(true);
    expect(store.get('rec-1', 'user-A')?.status).toBe('cancelled');
  });
});

describe('accounts (H1)', () => {
  it('account B never sees account A’s Work History; signed out sees nothing', () => {
    const { store } = storeWith([]);
    store.record(base({ id: 'a-1', goal: 'A’s task' }), 'user-A');
    store.record(base({ id: 'b-1', goal: 'B’s task' }), 'user-B');
    expect(store.list('user-A').map((r) => r.id)).toEqual(['a-1']);
    expect(store.list('user-B').map((r) => r.id)).toEqual(['b-1']);
    expect(store.get('a-1', 'user-B')).toBeUndefined();
    expect(store.list(null)).toEqual([]);
  });

  it('the owner is the verified account, never the one the renderer claims', () => {
    const { store } = storeWith([]);
    store.record(base({ id: 'claimed', userId: 'user-B' }), 'user-A');
    expect(store.get('claimed', 'user-A')?.userId).toBe('user-A');
    expect(store.get('claimed', 'user-B')).toBeUndefined();
  });

  it('another account cannot overwrite a record; records without an account are never readable', () => {
    const { store } = storeWith([base({ id: 'legacy', userId: undefined })]);
    store.record(base({ id: 'mine', summary: 'original', revision: 1 }), 'user-A');
    expect(store.record(base({ id: 'mine', summary: 'hijacked', revision: 9 }), 'user-B')).toBe(false);
    expect(store.get('mine', 'user-A')?.summary).toBe('original');
    expect(store.list('user-A').map((r) => r.id)).toEqual(['mine']);
    expect(store.get('legacy', 'user-A')).toBeUndefined();
  });
});
