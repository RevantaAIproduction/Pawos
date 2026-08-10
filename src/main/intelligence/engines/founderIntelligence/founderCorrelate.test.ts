import { describe, expect, it } from 'vitest';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import { FOUNDER_CORRELATION_RULES, founderReportBuilder } from './founderCorrelate';
import type { AggregatedDomainReports } from '../productIntelligence/productEvidence';
import type { Finding, IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { MarketingReportFields } from '../../../../shared/intelligence/MarketingReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    category: 'risk',
    severity: 'moderate',
    confidence: 'high',
    statement: 'A finding.',
    evidenceRefs: [],
    provenance: 'observed',
    ...overrides,
  };
}

function makeMarketing(findings: Finding[] = [], subject = 'https://example.com/'): IntelligenceReport<MarketingReportFields> {
  return {
    engineId: 'marketing',
    subject,
    generatedAt: Date.now(),
    overallScore: 80,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: { startUrl: subject, pagesReviewed: 1, pagesFailed: 0, hitCrawlBound: false, sitemapFound: true, pages: [] },
    approvalRequired: false,
  };
}

function makeRepository(findings: Finding[] = [], overrides: Partial<RepositoryReportFields> = {}, subject = 'C:/repo'): IntelligenceReport<RepositoryReportFields> {
  return {
    engineId: 'repository',
    subject,
    generatedAt: Date.now(),
    overallScore: 80,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      repoPath: subject,
      workspaceName: 'repo',
      language: 'TypeScript',
      framework: null,
      buildTool: null,
      packageManager: 'npm',
      isGitRepo: true,
      hasTests: true,
      hasDocker: false,
      recentCommitCount: 3,
      ...overrides,
    },
    approvalRequired: false,
  };
}

function makeEvidence(overrides: Partial<AggregatedDomainReports> = {}): AggregatedDomainReports {
  return { ...overrides };
}

describe('FOUNDER_CORRELATION_RULES', () => {
  it('reuses Product Intelligence rules — a requested-but-missing website report still surfaces', () => {
    const findings = correlate(makeEvidence({ requestedUrl: 'https://example.com/' }), FOUNDER_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresApiAccess' && f.statement.includes('Website Intelligence'))).toBe(true);
  });

  it('lifts the single highest-severity actionable finding across all domains as the top priority', () => {
    const repository = makeRepository([
      makeFinding({ id: 'minor1', severity: 'minor', category: 'gap', statement: 'Minor repo gap.' }),
    ]);
    const marketing = makeMarketing([
      makeFinding({ id: 'major1', severity: 'major', category: 'risk', statement: 'Major marketing risk.', confidence: 'medium', provenance: 'inferred' }),
    ]);
    const findings = correlate(makeEvidence({ repository, marketing }), FOUNDER_CORRELATION_RULES);

    const top = findings.find((f) => f.statement.startsWith('Top priority across analyzed domains:'));
    expect(top).toBeDefined();
    expect(top?.statement).toContain('[marketing]');
    expect(top?.statement).toContain('Major marketing risk.');
    expect(top?.severity).toBe('major');
    expect(top?.confidence).toBe('medium');
    expect(top?.provenance).toBe('inferred'); // carried forward unchanged, never re-scored
  });

  it('produces no top-priority finding when nothing actionable exists in any available report', () => {
    const marketing = makeMarketing([makeFinding({ category: 'strength' })]);
    const findings = correlate(makeEvidence({ marketing }), FOUNDER_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.startsWith('Top priority across analyzed domains:'))).toBe(false);
  });

  it('gives a growth-advisor recommendation when marketing lacks CTAs or analytics', () => {
    const marketing = makeMarketing([makeFinding({ statement: 'No common call-to-action phrasing was found.' })]);
    const findings = correlate(makeEvidence({ marketing }), FOUNDER_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.startsWith('As a growth advisor:'))).toBe(true);
  });

  it('gives a technical-architect recommendation when the repository has no test suite', () => {
    const repository = makeRepository([], { hasTests: false });
    const findings = correlate(makeEvidence({ repository }), FOUNDER_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.startsWith('As a technical architect:'))).toBe(true);
  });

  it('gives no technical-architect recommendation when the repository already has tests', () => {
    const repository = makeRepository([], { hasTests: true });
    const findings = correlate(makeEvidence({ repository }), FOUNDER_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.startsWith('As a technical architect:'))).toBe(false);
  });
});

describe('founderReportBuilder', () => {
  it('reuses domainLists logic and recovers the topPriority finding from the assembled findings', () => {
    const repository = makeRepository([makeFinding({ severity: 'critical', category: 'risk', statement: 'Critical repo issue.' })], {}, 'C:/repo');
    const evidence = makeEvidence({ requestedRepoPath: 'C:/repo', repository });
    const findings = correlate(evidence, FOUNDER_CORRELATION_RULES);
    const fields = founderReportBuilder.build('C:/repo', evidence, findings);

    expect(fields.domainsAnalyzed).toContain('repository');
    expect(fields.topPriority?.severity).toBe('critical');
    expect(fields.topPriority?.statement).toContain('Critical repo issue.');
  });
});
