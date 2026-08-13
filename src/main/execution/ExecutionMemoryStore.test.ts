import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-execution-memory-store-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`Unexpected app path: ${name}`);
      return userDataDir;
    },
  },
}));

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'work-1',
    goal: 'Build app',
    status: 'in_progress',
    startedAt: 1,
    applicationsUsed: [],
    aiWorkersUsed: [],
    commandsExecuted: [],
    filesCreated: [],
    filesModified: [],
    verificationResults: [],
    recoveryAttempts: 0,
    timeline: [],
    summary: '',
    ...overrides,
  };
}

describe('ExecutionMemoryStore', () => {
  beforeEach(() => {
    vi.resetModules();
    fs.rmSync(path.join(userDataDir, 'execution-history.json'), { force: true });
  });

  it('upserts live Work Record snapshots by id', async () => {
    const { executionMemoryStore } = await import('./ExecutionMemoryStore');
    executionMemoryStore.init();

    executionMemoryStore.record(record());
    executionMemoryStore.record(record({ status: 'completed', completedAt: 5, summary: 'Done.' }));

    const records = executionMemoryStore.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'work-1', status: 'completed', summary: 'Done.' });
  });
});
