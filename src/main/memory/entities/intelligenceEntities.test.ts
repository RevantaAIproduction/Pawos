import { beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-memgraph-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import { findLatestIntelligenceReport, recordIntelligenceReport } from './intelligenceEntities';
import type { IntelligenceReport } from '../../../shared/intelligence/IntelligenceReportTypes';

function fakeReport(subject: string, overrides: Partial<IntelligenceReport> = {}): IntelligenceReport {
  return {
    engineId: 'repository',
    subject,
    generatedAt: Date.now(),
    overallScore: 90,
    findings: [],
    observedSummary: 'No directly observed or inferred findings.',
    requiresAccessSummary: [],
    domain: { repoPath: subject },
    approvalRequired: false,
    ...overrides,
  };
}

describe('intelligenceEntities — real Memory Graph persistence', () => {
  beforeAll(() => {
    memoryGraphStore.init();
  });

  it('persists a new report and reads it back by engine + subject', () => {
    const report = fakeReport('/tmp/my-repo');

    const entity = recordIntelligenceReport(report);

    expect(entity.type).toBe('intelligenceReport');
    const found = findLatestIntelligenceReport('repository', '/tmp/my-repo');
    expect(found?.id).toBe(entity.id);
    expect((found?.attributes as { report: IntelligenceReport }).report.overallScore).toBe(90);
  });

  it('updates the same entity in place on re-analysis rather than duplicating it', () => {
    const first = recordIntelligenceReport(fakeReport('/tmp/other-repo', { overallScore: 50 }));
    const second = recordIntelligenceReport(fakeReport('/tmp/other-repo', { overallScore: 80 }));

    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    const found = findLatestIntelligenceReport('repository', '/tmp/other-repo');
    expect((found?.attributes as { report: IntelligenceReport }).report.overallScore).toBe(80);
  });

  it('accumulates a real version history across repeated re-analysis rather than only bumping a counter', () => {
    const subject = '/tmp/versioned-repo';
    recordIntelligenceReport(fakeReport(subject, { overallScore: 10 }));
    recordIntelligenceReport(fakeReport(subject, { overallScore: 50 }));
    const third = recordIntelligenceReport(fakeReport(subject, { overallScore: 90 }));

    expect(third.version).toBe(3);
    expect(third.history).toHaveLength(3);
    expect(third.history.map((h) => h.changeType)).toEqual(['created', 'modified', 'modified']);
    expect(third.history.map((h) => h.version)).toEqual([1, 2, 3]);
    // Each history entry's own snapshot reflects that version's real report, not the latest
    // overwriting earlier entries — proving history is a real append-only log, not a duplicated
    // pointer to the current attributes.
    const scores = third.history.map((h) => (h.attributesSnapshot as { report: IntelligenceReport } | undefined)?.report.overallScore);
    expect(scores).toEqual([10, 50, 90]);
  });

  it('keeps reports for different engines on the same subject as distinct entities', () => {
    const repoReport = recordIntelligenceReport(fakeReport('/tmp/shared-subject'));
    const productReport = recordIntelligenceReport({ ...fakeReport('/tmp/shared-subject'), engineId: 'product' });

    expect(repoReport.id).not.toBe(productReport.id);
    expect(findLatestIntelligenceReport('repository', '/tmp/shared-subject')?.id).toBe(repoReport.id);
    expect(findLatestIntelligenceReport('product', '/tmp/shared-subject')?.id).toBe(productReport.id);
  });

  it('links the report to a subject entity via RELATION.ANALYZED_AS when one is given', () => {
    const subject = memoryGraphStore.upsertEntity('codingProject', { root: '/tmp/linked-repo' });

    const report = recordIntelligenceReport(fakeReport('/tmp/linked-repo'), subject.id);

    const related = memoryGraphStore.getRelated(subject.id, RELATION.ANALYZED_AS);
    expect(related.some((e) => e.id === report.id)).toBe(true);
  });

  it('matches subjects case- and whitespace-insensitively, same discipline as other entity wrappers', () => {
    recordIntelligenceReport(fakeReport('  /tmp/Case-Repo  '));
    const found = findLatestIntelligenceReport('repository', '/TMP/case-repo');
    expect(found).toBeDefined();
  });

  it('returns undefined for a subject that was never analyzed', () => {
    expect(findLatestIntelligenceReport('repository', '/tmp/never-seen-xyz')).toBeUndefined();
  });
});
