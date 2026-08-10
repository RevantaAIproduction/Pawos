import { describe, expect, it } from 'vitest';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import { MARKETING_CORRELATION_RULES, marketingReportBuilder } from './marketingCorrelate';
import type { MarketingEvidence } from './marketingEvidence';
import type { MarketingPageSummary } from '../../../../shared/intelligence/MarketingReportTypes';

function makePage(overrides: Partial<MarketingPageSummary> = {}): MarketingPageSummary {
  return {
    url: 'https://example.com/',
    hasOpenGraphTags: true,
    hasTwitterCardTags: true,
    hasStructuredData: true,
    analyticsDetected: ['google-analytics'],
    ctaKeywordCount: 1,
    socialLinks: ['facebook.com'],
    hasContactInfo: true,
    hasFavicon: true,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<MarketingEvidence> = {}): MarketingEvidence {
  return {
    startUrl: 'https://example.com/',
    pagesFailed: 0,
    hitCrawlBound: false,
    sitemapFound: true,
    pages: [makePage()],
    ...overrides,
  };
}

describe('MARKETING_CORRELATION_RULES', () => {
  it('flags pages missing Open Graph tags', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasOpenGraphTags: false })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'gap' && f.statement.includes('Open Graph'))).toBe(true);
  });

  it('does not flag pages that already have Open Graph tags', () => {
    const findings = correlate(makeEvidence(), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('Open Graph'))).toBe(false);
  });

  it('flags pages missing a Twitter Card tag', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasTwitterCardTags: false })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('Twitter Card'))).toBe(true);
  });

  it('flags pages missing structured data', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasStructuredData: false })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'opportunity' && f.statement.includes('structured data'))).toBe(true);
  });

  it('flags when no analytics script is detected on any page', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ analyticsDetected: [] })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('analytics/tracking script'))).toBe(true);
  });

  it('does not flag analytics when at least one page has a known tracker', () => {
    const findings = correlate(makeEvidence(), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('analytics/tracking script'))).toBe(false);
  });

  it('flags when no CTA phrasing is detected anywhere', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ ctaKeywordCount: 0 })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('call-to-action'))).toBe(true);
  });

  it('infers commercial intent from a high CTA count, tagged as inferred not observed', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ ctaKeywordCount: 5 })] }), MARKETING_CORRELATION_RULES);
    const inferred = findings.find((f) => f.provenance === 'inferred');
    expect(inferred).toBeDefined();
    expect(inferred?.statement).toContain('conversion-oriented phrases');
  });

  it('does not infer commercial intent from a low CTA count', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ ctaKeywordCount: 1 })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'inferred')).toBe(false);
  });

  it('flags when no social links are detected on any page', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ socialLinks: [] })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('social media platform'))).toBe(true);
  });

  it('flags when no contact info is detected on any page', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasContactInfo: false })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('mailto'))).toBe(true);
  });

  it('flags when no favicon is detected on any page', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasFavicon: false })] }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('favicon'))).toBe(true);
  });

  it('flags a missing sitemap.xml', () => {
    const findings = correlate(makeEvidence({ sitemapFound: false }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('sitemap.xml'))).toBe(true);
  });

  it('flags failed page fetches', () => {
    const findings = correlate(makeEvidence({ pagesFailed: 2 }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('failed to load'))).toBe(true);
  });

  it('discloses when the review stopped at a bound rather than running out of links', () => {
    const findings = correlate(makeEvidence({ hitCrawlBound: true }), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('review stopped'))).toBe(true);
  });

  it('always discloses the JS-rendered marketing tooling gap', () => {
    const findings = correlate(makeEvidence(), MARKETING_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresApiAccess' && f.statement.includes('dynamically-injected'))).toBe(true);
  });
});

describe('marketingReportBuilder', () => {
  it('assembles domain fields purely from evidence', () => {
    const evidence = makeEvidence({ pages: [makePage(), makePage({ url: 'https://example.com/about' })] });
    const findings = correlate(evidence, MARKETING_CORRELATION_RULES);
    const fields = marketingReportBuilder.build(evidence.startUrl, evidence, findings);

    expect(fields.startUrl).toBe(evidence.startUrl);
    expect(fields.pagesReviewed).toBe(2);
    expect(fields.sitemapFound).toBe(true);
    expect(fields.pages).toHaveLength(2);
    expect(fields.pages[0]!.url).toBe(evidence.pages[0]!.url);
  });
});
