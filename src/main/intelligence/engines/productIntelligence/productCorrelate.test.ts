import { describe, expect, it } from 'vitest';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import { PRODUCT_CORRELATION_RULES, productReportBuilder } from './productCorrelate';
import type { AggregatedDomainReports } from './productEvidence';
import type { Finding, IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';
import type { UxReportFields } from '../../../../shared/intelligence/UxReportTypes';
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

function makeWebsite(findings: Finding[] = [], subject = 'https://example.com/'): IntelligenceReport<WebsiteReportFields> {
  return {
    engineId: 'website',
    subject,
    generatedAt: Date.now(),
    overallScore: 80,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: {
      startUrl: subject,
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

function makeUx(findings: Finding[] = [], subject = 'https://example.com/'): IntelligenceReport<UxReportFields> {
  return {
    engineId: 'ux',
    subject,
    generatedAt: Date.now(),
    overallScore: 80,
    findings,
    observedSummary: '',
    requiresAccessSummary: [],
    domain: { startUrl: subject, pagesReviewed: 1, pagesFailed: 0, hitCrawlBound: false, pages: [] },
    approvalRequired: false,
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

describe('PRODUCT_CORRELATION_RULES', () => {
  it('flags a missing Website Intelligence report when a URL was requested but never analyzed', () => {
    const findings = correlate(makeEvidence({ requestedUrl: 'https://example.com/' }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresApiAccess' && f.statement.includes('Website Intelligence'))).toBe(true);
  });

  it('does not flag a missing website report when no URL was requested at all', () => {
    const findings = correlate(makeEvidence({ requestedRepoPath: 'C:/repo', repository: makeRepository() }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('Website Intelligence'))).toBe(false);
  });

  it('flags a missing Repository Intelligence report with requiresRepositoryAccess provenance', () => {
    const findings = correlate(makeEvidence({ requestedRepoPath: 'C:/repo' }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresRepositoryAccess' && f.statement.includes('Repository Intelligence'))).toBe(true);
  });

  it('summarizes an available website report honestly from its own real score/findings', () => {
    const website = makeWebsite([makeFinding({ category: 'risk' })]);
    const findings = correlate(makeEvidence({ requestedUrl: website.subject, website }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('Website Intelligence: overall score 80'))).toBe(true);
  });

  it('infers early-stage maturity when repository lacks tests and UX has multiple risks', () => {
    const repository = makeRepository([], { hasTests: false });
    const ux = makeUx([makeFinding({ category: 'risk' }), makeFinding({ category: 'risk', id: 'f2' })]);
    const findings = correlate(makeEvidence({ repository, ux }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'inferred' && f.statement.includes('early-stage product'))).toBe(true);
  });

  it('does not infer early-stage maturity when the repository has tests', () => {
    const repository = makeRepository([], { hasTests: true });
    const ux = makeUx([makeFinding({ category: 'risk' }), makeFinding({ category: 'risk', id: 'f2' })]);
    const findings = correlate(makeEvidence({ repository, ux }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('early-stage product'))).toBe(false);
  });

  it('infers a discoverability/shareability gap when website SEO and marketing social-sharing findings both exist', () => {
    const website = makeWebsite([makeFinding({ statement: 'Missing meta description on 1 page.' })]);
    const marketing = makeMarketing([makeFinding({ statement: 'Missing Open Graph tags on 1 page.' })]);
    const findings = correlate(makeEvidence({ website, marketing }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'inferred' && f.statement.includes('broader content/metadata investment gap'))).toBe(true);
  });

  it('does not infer a discoverability gap when only one domain flags an issue', () => {
    const website = makeWebsite([makeFinding({ statement: 'Missing meta description on 1 page.' })]);
    const findings = correlate(makeEvidence({ website }), PRODUCT_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('broader content/metadata investment gap'))).toBe(false);
  });
});

describe('productReportBuilder', () => {
  it('lists analyzed and missing domains honestly based on what was actually requested and found', () => {
    const website = makeWebsite();
    const evidence = makeEvidence({ requestedUrl: website.subject, website, requestedRepoPath: 'C:/repo' });
    const findings = correlate(evidence, PRODUCT_CORRELATION_RULES);
    const fields = productReportBuilder.build(website.subject, evidence, findings);

    expect(fields.domainsAnalyzed).toContain('website');
    expect(fields.domainsMissing).toContain('ux');
    expect(fields.domainsMissing).toContain('marketing');
    expect(fields.domainsMissing).toContain('repository');
    expect(fields.websiteSubject).toBe(website.subject);
  });
});
