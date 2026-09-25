import { describe, expect, it } from 'vitest';
import { getTicketSizePriceUsd, TICKET_CANCELLATION_FEE_USD, TICKET_RETRY_FEE_USD, TICKET_START_MINIMUM_USD } from '../../shared/organization/AutonomousTaskBillingTypes';
import { measureChangeSize } from './AutonomousChangeSize';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

describe('Autonomous Work pricing (mirror of the server table)', () => {
  it.each([
    [1, 1, 1], [1, 10, 1], [1, 40, 5], [3, 60, 5], [4, 80, 7.5], [9, 200, 7.5],
    [10, 300, 10], [20, 900, 10], [21, 900, 15], [30, 900, 15], [31, 900, 20.5], [40, 900, 25],
    [50, 900, 30], [51, 900, 30.5], [120, 2000, 65], [1, 1500, 10], [0, 0, 1],
  ])('%i file(s), %i line(s) → $%s', (files, lines, price) => {
    expect(getTicketSizePriceUsd(files, lines)).toBe(price);
  });

  it('fees', () => {
    expect(TICKET_START_MINIMUM_USD).toBe(5);
    expect(TICKET_RETRY_FEE_USD).toBe(3);
    expect(TICKET_CANCELLATION_FEE_USD).toBe(2.5);
  });
});

describe('measureChangeSize', () => {
  const base = { id: 'r', goal: '', status: 'completed', startedAt: 0, applicationsUsed: [], aiWorkersUsed: [], commandsExecuted: [], filesCreated: [], filesModified: [], verificationResults: [], recoveryAttempts: 0, timeline: [], summary: '' } as unknown as ExecutionRecord;

  it('a one-line edit counts 1 file, 1 line (not 2)', () => {
    const record = { ...base, diffEvidence: [{ timestamp: 1, filesChanged: [{ path: 'src/a.ts', added: 1, deleted: 1 }], totalAdded: 1, totalDeleted: 1, summary: '' }] };
    expect(measureChangeSize(record)).toEqual({ filesChanged: 1, linesChanged: 1 });
  });

  it('uses the latest diff per file and never double-counts a path', () => {
    const record = {
      ...base,
      diffEvidence: [
        { timestamp: 1, filesChanged: [{ path: 'src\\a.ts', added: 5, deleted: 0 }, { path: 'src/b.ts', added: 2, deleted: 7 }], totalAdded: 7, totalDeleted: 7, summary: '' },
        { timestamp: 2, filesChanged: [{ path: 'src/a.ts', added: 40, deleted: 3 }], totalAdded: 40, totalDeleted: 3, summary: '' },
      ],
      fileEvidence: [{ operation: 'MODIFY', path: 'C:/work/src/a.ts', relativePath: 'src/a.ts', timestamp: 2, result: 'completed' }],
    } as unknown as ExecutionRecord;
    expect(measureChangeSize(record)).toEqual({ filesChanged: 2, linesChanged: 47 });
  });

  it('falls back to the file log when no diff was captured; failed file operations do not count', () => {
    const record = {
      ...base,
      fileEvidence: [
        { operation: 'CREATE', path: '/w/x.ts', relativePath: 'x.ts', timestamp: 1, result: 'completed' },
        { operation: 'MODIFY', path: '/w/y.ts', relativePath: 'y.ts', timestamp: 1, result: 'failed' },
      ],
    } as unknown as ExecutionRecord;
    expect(measureChangeSize(record)).toEqual({ filesChanged: 1, linesChanged: 0 });
    expect(measureChangeSize(null)).toEqual({ filesChanged: 0, linesChanged: 0 });
  });
});
