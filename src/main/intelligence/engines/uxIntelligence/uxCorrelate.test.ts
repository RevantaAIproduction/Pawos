import { describe, expect, it } from 'vitest';
import { correlate } from '../../EvidenceCorrelationReportEngine';
import { UX_CORRELATION_RULES, uxReportBuilder } from './uxCorrelate';
import type { UxEvidence } from './uxEvidence';
import type { UxPageSummary } from '../../../../shared/intelligence/UxReportTypes';

function makePage(overrides: Partial<UxPageSummary> = {}): UxPageSummary {
  return {
    url: 'https://example.com/',
    headingCounts: { h1: 1, h2: 2, h3: 0, h4: 0, h5: 0, h6: 0 },
    imageCount: 2,
    imagesWithAltCount: 2,
    formFieldCount: 2,
    labeledFormFieldCount: 2,
    hasNavLandmark: true,
    hasLangAttribute: true,
    emptyInteractiveElementCount: 0,
    ...overrides,
  };
}

function makeEvidence(overrides: Partial<UxEvidence> = {}): UxEvidence {
  return {
    startUrl: 'https://example.com/',
    pagesFailed: 0,
    hitCrawlBound: false,
    pages: [makePage()],
    ...overrides,
  };
}

describe('UX_CORRELATION_RULES', () => {
  it('flags pages with no h1 heading', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'gap' && f.statement.includes('<h1>'))).toBe(true);
  });

  it('does not flag pages that have exactly one h1', () => {
    const findings = correlate(makeEvidence(), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('no <h1> heading'))).toBe(false);
  });

  it('flags pages with more than one h1', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ headingCounts: { h1: 2, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('more than one <h1>'))).toBe(true);
  });

  it('flags images missing alt text', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ imageCount: 4, imagesWithAltCount: 1 })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('alt text'))).toBe(true);
  });

  it('does not flag images when every image has alt text', () => {
    const findings = correlate(makeEvidence(), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('alt text'))).toBe(false);
  });

  it('flags unlabeled form fields', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ formFieldCount: 3, labeledFormFieldCount: 1 })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('no associated'))).toBe(true);
  });

  it('flags empty interactive elements', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ emptyInteractiveElementCount: 3 })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('effectively silent'))).toBe(true);
  });

  it('flags pages missing a nav landmark', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasNavLandmark: false })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('<nav>'))).toBe(true);
  });

  it('flags pages missing an html lang attribute', () => {
    const findings = correlate(makeEvidence({ pages: [makePage({ hasLangAttribute: false })] }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.category === 'risk' && f.statement.includes('lang attribute'))).toBe(true);
  });

  it('flags failed page fetches', () => {
    const findings = correlate(makeEvidence({ pagesFailed: 2 }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('failed to load'))).toBe(true);
  });

  it('discloses when the review stopped at a bound rather than running out of links', () => {
    const findings = correlate(makeEvidence({ hitCrawlBound: true }), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.statement.includes('review stopped'))).toBe(true);
  });

  it('always discloses the visual-layout gap', () => {
    const findings = correlate(makeEvidence(), UX_CORRELATION_RULES);
    expect(findings.some((f) => f.provenance === 'requiresApiAccess' && f.statement.includes('color contrast'))).toBe(true);
  });
});

describe('uxReportBuilder', () => {
  it('assembles domain fields purely from evidence', () => {
    const evidence = makeEvidence({ pages: [makePage(), makePage({ url: 'https://example.com/about' })] });
    const findings = correlate(evidence, UX_CORRELATION_RULES);
    const fields = uxReportBuilder.build(evidence.startUrl, evidence, findings);

    expect(fields.startUrl).toBe(evidence.startUrl);
    expect(fields.pagesReviewed).toBe(2);
    expect(fields.pages).toHaveLength(2);
    expect(fields.pages[0]!.url).toBe(evidence.pages[0]!.url);
  });
});
