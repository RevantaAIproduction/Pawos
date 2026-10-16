import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/ipc/ipcBridgeImplementation', () => ({ ipc: {} }));

import type { CodeChangeSummary } from '../../shared/actions/CodeChangeTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { patchRecords, patchSummaries } from './useTaskCenterData';

/** M5: an update patches only the task it names — no reload of the whole history. */

const rec = (id: string, summary = ''): ExecutionRecord =>
  ({ id, goal: id, status: 'in_progress', startedAt: 1, applicationsUsed: [], aiWorkersUsed: [], commandsExecuted: [], filesCreated: [], filesModified: [], verificationResults: [], recoveryAttempts: 0, timeline: [], summary }) as ExecutionRecord;

describe('patching one task', () => {
  it('replaces the named record, keeps the rest, and never duplicates it', () => {
    const before = [rec('a'), rec('b'), rec('c')];
    const after = patchRecords(before, 'b', rec('b', 'updated'));
    expect(after).toHaveLength(3);
    expect(after.find((r) => r.id === 'b')?.summary).toBe('updated');
    expect(after.filter((r) => r.id === 'a')[0]).toBe(before[0]); // untouched rows are the same objects
    expect(patchRecords(after, 'b', rec('b', 'again')).filter((r) => r.id === 'b')).toHaveLength(1);
  });

  it('a record that is no longer readable (another account, removed) disappears', () => {
    expect(patchRecords([rec('a'), rec('b')], 'b', null).map((r) => r.id)).toEqual(['a']);
  });

  it('change summaries are patched the same way', () => {
    const summary = (files: number) => ({ executionId: 'x', totals: { files } }) as unknown as CodeChangeSummary;
    const map = patchSummaries(new Map([['y', summary(9)]]), 'x', summary(2));
    expect(map.get('x')?.totals.files).toBe(2);
    expect(map.get('y')?.totals.files).toBe(9);
    expect(patchSummaries(map, 'x', null).has('x')).toBe(false);
  });
});
