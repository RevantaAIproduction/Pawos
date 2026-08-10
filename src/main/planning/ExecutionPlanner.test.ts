import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildPlan } from './ExecutionPlanner';
import type { Finding, IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../shared/intelligence/RepositoryReportTypes';
import type { WebsiteReportFields } from '../../shared/intelligence/WebsiteReportTypes';

function makeMissingTestsFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'missing-tests-1',
    category: 'gap',
    severity: 'moderate',
    confidence: 'medium',
    statement: 'No test script or test files were found in the project.',
    evidenceRefs: ['context.hasTests'],
    provenance: 'observed',
    ...overrides,
  };
}

function makeOtherFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'other-1',
    category: 'gap',
    severity: 'minor',
    confidence: 'high',
    statement: 'Some other unrelated finding with no automation rule.',
    evidenceRefs: ['context.hasDocker'],
    provenance: 'observed',
    ...overrides,
  };
}

function makeRepositoryReport(findings: Finding[], overrides: Partial<RepositoryReportFields> = {}): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject: 'C:/fake/repo',
    generatedAt: Date.now(),
    overallScore: 70,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      repoPath: 'C:/fake/repo',
      workspaceName: 'fake-repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: false,
      hasDocker: false,
      recentCommitCount: 2,
      ...overrides,
    },
    approvalRequired: false,
  };
}

function makeWebsiteReport(findings: Finding[]): IntelligenceReport<WebsiteReportFields> {
  return {
    engineId: 'website',
    subject: 'https://example.com/',
    generatedAt: Date.now(),
    overallScore: 80,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      startUrl: 'https://example.com/',
      origin: 'https://example.com',
      usesHttps: true,
      robotsTxtFound: true,
      disallowedPathsSkipped: [],
      pagesVisited: 1,
      pagesFailed: 0,
      hitCrawlBound: false,
      securityHeaders: { contentSecurityPolicy: true, strictTransportSecurity: true, xFrameOptions: true },
      pages: [],
    },
    approvalRequired: false,
  };
}

describe('buildPlan', () => {
  it('builds a real runCommand step for an approved, matching repository finding', () => {
    const finding = makeMissingTestsFinding();
    const report = makeRepositoryReport([finding]);
    const plan = buildPlan(report, 'entity-1', [finding.id]);

    expect(plan.sourceReportId).toBe('entity-1');
    expect(plan.approvalRequired).toBe(true);
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0]!;
    expect(step.findingRefs).toEqual([finding.id]);
    expect(step.status).toBe('proposed');
    expect(step.actionRequest).toEqual({ type: 'runCommand', command: 'npm install --save-dev vitest', cwd: 'C:/fake/repo' });
    expect(step.rationale).toContain(finding.statement);
    expect(step.rationale).toContain('fake-repo');
    expect(plan.unplannableFindingIds).toHaveLength(0);
  });

  it('picks yarn/pnpm-specific commands based on the report\'s real packageManager', () => {
    const yarnFinding = makeMissingTestsFinding({ id: 'yarn-finding' });
    const yarnPlan = buildPlan(makeRepositoryReport([yarnFinding], { packageManager: 'yarn' }), 'e', [yarnFinding.id]);
    expect(yarnPlan.steps[0]?.actionRequest).toMatchObject({ command: 'yarn add --dev vitest' });

    const pnpmFinding = makeMissingTestsFinding({ id: 'pnpm-finding' });
    const pnpmPlan = buildPlan(makeRepositoryReport([pnpmFinding], { packageManager: 'pnpm' }), 'e', [pnpmFinding.id]);
    expect(pnpmPlan.steps[0]?.actionRequest).toMatchObject({ command: 'pnpm add -D vitest' });
  });

  it('names an approved finding with no automation rule in unplannableFindingIds rather than fabricating a step', () => {
    const finding = makeOtherFinding();
    const report = makeRepositoryReport([finding]);
    const plan = buildPlan(report, 'entity-1', [finding.id]);

    expect(plan.steps).toHaveLength(0);
    expect(plan.unplannableFindingIds).toEqual([finding.id]);
  });

  it('ignores a finding that was never approved — it is neither planned nor listed as unplannable', () => {
    const approved = makeMissingTestsFinding({ id: 'approved-1' });
    const unapproved = makeOtherFinding({ id: 'unapproved-1' });
    const report = makeRepositoryReport([approved, unapproved]);
    const plan = buildPlan(report, 'entity-1', [approved.id]);

    expect(plan.steps).toHaveLength(1);
    expect(plan.unplannableFindingIds).toHaveLength(0);
  });

  it('never applies the repository-only rule to a similarly-worded finding from a different engine', () => {
    const finding = makeMissingTestsFinding({ id: 'website-lookalike' });
    const report = makeWebsiteReport([finding]);
    const plan = buildPlan(report, 'entity-1', [finding.id]);

    expect(plan.steps).toHaveLength(0);
    expect(plan.unplannableFindingIds).toEqual([finding.id]);
  });

  it('re-verifies the underlying domain fact and refuses to plan if hasTests is actually true', () => {
    const finding = makeMissingTestsFinding({ id: 'stale-finding' });
    const report = makeRepositoryReport([finding], { hasTests: true });
    const plan = buildPlan(report, 'entity-1', [finding.id]);

    expect(plan.steps).toHaveLength(0);
    expect(plan.unplannableFindingIds).toEqual([finding.id]);
  });

  it('produces an empty plan for an empty approved-findings list', () => {
    const report = makeRepositoryReport([makeMissingTestsFinding()]);
    const plan = buildPlan(report, 'entity-1', []);
    expect(plan.steps).toHaveLength(0);
    expect(plan.unplannableFindingIds).toHaveLength(0);
  });
});

describe('buildPlan invariants (hardening)', () => {
  it('holds two structural invariants across every step of a multi-finding plan: status is always "proposed", and every findingRefs id is a real member of the report\'s own findings', () => {
    const matchA = makeMissingTestsFinding({ id: 'match-a' });
    const matchB = makeMissingTestsFinding({ id: 'match-b', statement: 'A second, independent missing-tests-shaped finding.' });
    const unplannable = makeOtherFinding({ id: 'unplannable-a' });
    const report = makeRepositoryReport([matchA, matchB, unplannable]);
    const realFindingIds = new Set(report.findings.map((f) => f.id));

    const plan = buildPlan(report, 'entity-1', [matchA.id, matchB.id, unplannable.id]);

    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(step.status).toBe('proposed');
      expect(step.findingRefs.length).toBeGreaterThan(0);
      for (const refId of step.findingRefs) {
        expect(realFindingIds.has(refId)).toBe(true);
      }
    }
    // Every step id is unique — no two steps accidentally share an id.
    const stepIds = plan.steps.map((s) => s.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    // The approved set is fully accounted for: every id is either planned or named unplannable, never both, never neither.
    const plannedFindingIds = new Set(plan.steps.flatMap((s) => s.findingRefs));
    for (const approvedId of [matchA.id, matchB.id, unplannable.id]) {
      const planned = plannedFindingIds.has(approvedId);
      const unplanned = plan.unplannableFindingIds.includes(approvedId);
      expect(planned !== unplanned).toBe(true); // exactly one of the two, an XOR
    }
  });
});

describe('ExecutionPlanner module boundary', () => {
  it('never imports DesktopExecutionEngine or calls execute() itself — the Think -> Plan wall is structural, not just a convention', () => {
    const raw = fs.readFileSync(path.join(__dirname, 'ExecutionPlanner.ts'), 'utf-8');
    // Strip comments first — the file's own doc comments legitimately explain this constraint in
    // prose (mentioning "DesktopExecutionEngine" and "execute()" by name), which would otherwise
    // false-positive against the same checks meant to catch a real violation in the code itself.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/DesktopExecutionEngine/);
    expect(code).not.toMatch(/\.execute\(/);
  });
});
