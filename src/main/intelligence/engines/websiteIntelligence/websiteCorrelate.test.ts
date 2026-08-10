import { describe, expect, it } from 'vitest';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import { WEBSITE_CORRELATION_RULES, websiteReportBuilder } from './websiteCorrelate';
import type { WebsiteEvidence, WebsitePageEvidence } from './websiteEvidence';

function makePage(overrides: Partial<WebsitePageEvidence> = {}): WebsitePageEvidence {
  return {
    url: 'https://example.com/',
    statusCode: 200,
    title: 'A Title',
    hasMetaDescription: true,
    hasViewportMeta: true,
    wordCount: 200,
    internalLinkCount: 3,
    externalLinkCount: 1,
    headers: { 'content-security-policy': "default-src 'self'", 'strict-transport-security': 'max-age=1', 'x-frame-options': 'DENY' },
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<WebsiteEvidence> = {}): WebsiteEvidence {
  return {
    startUrl: 'https://example.com/',
    origin: 'https://example.com',
    usesHttps: true,
    robotsTxtFound: true,
    disallowedPathsSkipped: [],
    hitCrawlBound: false,
    pagesFailed: 0,
    pages: [makePage()],
    ...overrides,
  };
}

describe('WEBSITE_CORRELATION_RULES', () => {
  it('flags plain HTTP as a major risk', () => {
    const findings = correlate(makeEvidence({ usesHttps: false, startUrl: 'http://example.com/' }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.severity === 'major' && /HTTP/.test(f.statement))).toBe(true);
  });

  it('does not flag HTTPS sites for the missingHttps rule', () => {
    const findings = correlate(makeEvidence(), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('unencrypted'))).toBe(false);
  });

  it('flags missing security headers', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ headers: {} })] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('Content-Security-Policy'))).toBe(true);
  });

  it('flags pages missing a title', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ title: null })] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('<title>'))).toBe(true);
  });

  it('flags pages missing a meta description', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasMetaDescription: false })] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('meta description'))).toBe(true);
  });

  it('flags pages missing a viewport meta tag', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasViewportMeta: false })] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('viewport'))).toBe(true);
  });

  it('flags thin-content pages', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ wordCount: 5 })] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'opportunity' && f.statement.includes('words'))).toBe(true);
  });

  it('flags failed page fetches', () => {
    const findings = correlate(makeEvidence({ pagesFailed: 2 }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('failed to load'))).toBe(true);
  });

  it('names disallowed paths honestly, never claiming they were checked', () => {
    const findings = correlate(makeEvidence({ disallowedPathsSkipped: ['/admin'] }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'observed' && f.statement.includes('/admin'))).toBe(true);
  });

  it('discloses when the crawl stopped at a bound rather than running out of links', () => {
    const findings = correlate(makeEvidence({ hitCrawlBound: true }), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('crawl stopped'))).toBe(true);
  });

  it('always discloses the no-JS-execution gap', () => {
    const findings = correlate(makeEvidence(), WEBSITE_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresApiAccess' && f.statement.includes('JavaScript'))).toBe(true);
  });
});

describe('websiteReportBuilder', () => {
  it('assembles domain fields purely from evidence', () => {
    const evidence = makeEvidence({ pages: [makePage(), makePage({ url: 'https://example.com/about', title: 'About' })] });
    const findings = correlate(evidence, WEBSITE_CORRELATION_RULES);
    const fields = websiteReportBuilder.build(evidence.startUrl, evidence, findings);

    expect(fields.startUrl).toBe(evidence.startUrl);
    expect(fields.pagesVisited).toBe(2);
    expect(fields.securityHeaders.contentSecurityPolicy).toBe(true);
    expect(fields.securityHeaders.strictTransportSecurity).toBe(true);
    expect(fields.securityHeaders.xFrameOptions).toBe(true);
    expect(fields.pages).toHaveLength(2);
    expect(fields.pages[0]!.url).toBe(evidence.pages[0]!.url);
  });
});
