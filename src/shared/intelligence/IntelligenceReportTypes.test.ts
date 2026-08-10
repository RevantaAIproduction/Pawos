import { describe, expect, it } from 'vitest';
import { computeOverallScore, groupFindingsByProvenance } from './IntelligenceReportTypes';
import type { Finding, FindingSeverity } from './IntelligenceReportTypes';
import type { EvidenceProvenance } from './EvidenceProvenance';

let nextId = 0;
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  nextId += 1;
  return {
    id: `finding-${nextId}`,
    category: 'gap',
    severity: 'minor',
    confidence: 'medium',
    statement: 'A test finding.',
    evidenceRefs: [],
    provenance: 'observed',
    ...overrides,
  };
}

describe('computeOverallScore', () => {
  it('returns 100 for an empty findings list — no evidence means nothing to penalize', () => {
    expect(computeOverallScore([])).toBe(100);
  });

  it('returns 100 when every finding is a strength/opportunity — only gap/risk categories ever penalize', () => {
    const findings = [
      makeFinding({ category: 'strength', severity: 'critical' }),
      makeFinding({ category: 'opportunity', severity: 'major' }),
    ];
    expect(computeOverallScore(findings)).toBe(100);
  });

  it.each<[FindingSeverity, number]>([
    ['info', 0],
    ['minor', 1],
    ['moderate', 2],
    ['major', 4],
    ['critical', 8],
  ])('applies the real severity weight for a single %s gap finding (penalty=%i)', (severity, expectedPenalty) => {
    const findings = [makeFinding({ category: 'gap', severity })];
    expect(computeOverallScore(findings)).toBe(100 - expectedPenalty);
  });

  it('sums penalties across multiple gap/risk findings rather than only counting the worst one', () => {
    const findings = [
      makeFinding({ category: 'gap', severity: 'major' }), // 4
      makeFinding({ category: 'risk', severity: 'moderate' }), // 2
      makeFinding({ category: 'gap', severity: 'minor' }), // 1
    ];
    expect(computeOverallScore(findings)).toBe(100 - 4 - 2 - 1);
  });

  it('treats risk findings the same as gap findings for scoring purposes', () => {
    const gapVersion = [makeFinding({ category: 'gap', severity: 'major' })];
    const riskVersion = [makeFinding({ category: 'risk', severity: 'major' })];
    expect(computeOverallScore(gapVersion)).toBe(computeOverallScore(riskVersion));
  });

  it('floors the score at 0 rather than going negative when penalties exceed 100', () => {
    const findings = Array.from({ length: 15 }, () => makeFinding({ category: 'gap', severity: 'critical' })); // 15 * 8 = 120
    expect(computeOverallScore(findings)).toBe(0);
  });

  it('rounds the final result (Math.round), not truncates, even though integer severity weights never actually produce a fractional penalty today', () => {
    const findings = [makeFinding({ category: 'gap', severity: 'moderate' })]; // penalty 2, no fractional component possible
    const score = computeOverallScore(findings);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBe(Math.round(score));
  });

  it.each<EvidenceProvenance>(['requiresRepositoryAccess', 'requiresApiAccess', 'requiresInternalDocumentation'])(
    'excludes a critical gap finding with provenance %s from the penalty entirely — a gap in what Paw could check is not evidence something is broken',
    (provenance) => {
      const findings = [makeFinding({ category: 'gap', severity: 'critical', provenance })];
      expect(computeOverallScore(findings)).toBe(100);
    },
  );

  it('scores a mix of checkable and unverifiable findings using only the checkable ones', () => {
    const findings = [
      makeFinding({ category: 'gap', severity: 'major', provenance: 'observed' }), // 4, counted
      makeFinding({ category: 'gap', severity: 'critical', provenance: 'requiresApiAccess' }), // excluded
      makeFinding({ category: 'risk', severity: 'moderate', provenance: 'inferred' }), // 2, counted
    ];
    expect(computeOverallScore(findings)).toBe(100 - 4 - 2);
  });
});

describe('groupFindingsByProvenance', () => {
  it('returns all 5 provenance buckets, empty, for an empty findings array — never a partial or missing-key object', () => {
    const groups = groupFindingsByProvenance([]);
    expect(groups).toEqual({
      observed: [],
      inferred: [],
      requiresRepositoryAccess: [],
      requiresApiAccess: [],
      requiresInternalDocumentation: [],
    });
  });

  it('sorts one finding of each provenance into its own distinct bucket', () => {
    const observed = makeFinding({ provenance: 'observed' });
    const inferred = makeFinding({ provenance: 'inferred' });
    const needsRepo = makeFinding({ provenance: 'requiresRepositoryAccess' });
    const needsApi = makeFinding({ provenance: 'requiresApiAccess' });
    const needsDocs = makeFinding({ provenance: 'requiresInternalDocumentation' });

    const groups = groupFindingsByProvenance([observed, inferred, needsRepo, needsApi, needsDocs]);

    expect(groups.observed).toEqual([observed]);
    expect(groups.inferred).toEqual([inferred]);
    expect(groups.requiresRepositoryAccess).toEqual([needsRepo]);
    expect(groups.requiresApiAccess).toEqual([needsApi]);
    expect(groups.requiresInternalDocumentation).toEqual([needsDocs]);
  });

  it('preserves original finding order within a bucket when multiple findings share a provenance', () => {
    const first = makeFinding({ provenance: 'observed', statement: 'first' });
    const second = makeFinding({ provenance: 'observed', statement: 'second' });
    const groups = groupFindingsByProvenance([first, second]);
    expect(groups.observed.map((f) => f.statement)).toEqual(['first', 'second']);
  });

  it('never drops or duplicates a finding across buckets — every input finding appears in exactly one output bucket', () => {
    const findings = [
      makeFinding({ provenance: 'observed' }),
      makeFinding({ provenance: 'inferred' }),
      makeFinding({ provenance: 'requiresRepositoryAccess' }),
      makeFinding({ provenance: 'observed' }),
    ];
    const groups = groupFindingsByProvenance(findings);
    const totalGrouped = Object.values(groups).reduce((sum, bucket) => sum + bucket.length, 0);
    expect(totalGrouped).toBe(findings.length);
  });
});
