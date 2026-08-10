import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields, WebsitePageSummary } from '../../../../shared/intelligence/WebsiteReportTypes';
import type { WebsiteEvidence } from './websiteEvidence';

const THIN_CONTENT_WORD_THRESHOLD = 50;

function hasSecurityHeader(evidence: WebsiteEvidence, header: string): boolean {
  const startPage = evidence.pages[0];
  return startPage ? header in startPage.headers : false;
}

/**
 * Website Intelligence's deterministic rubric — same discipline as repositoryCorrelate.ts's
 * REPOSITORY_CORRELATION_RULES: every rule reasons only over evidence gatherWebsiteEvidence()
 * already collected (a real, bounded, robots.txt-compliant crawl), never re-fetches, never
 * invents a finding it hasn't observed.
 */
export const WEBSITE_CORRELATION_RULES: CorrelationRule<WebsiteEvidence>[] = [
  {
    id: 'missingHttps',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.usesHttps) return [];
      return [
        {
          category: 'risk',
          severity: 'major',
          confidence: 'high',
          statement: `"${evidence.startUrl}" is served over plain HTTP, not HTTPS — visitor traffic is unencrypted.`,
          evidenceRefs: ['usesHttps'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingSecurityHeaders',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.pages.length === 0) return [];
      const missing: string[] = [];
      if (!hasSecurityHeader(evidence, 'content-security-policy')) missing.push('Content-Security-Policy');
      if (!hasSecurityHeader(evidence, 'strict-transport-security')) missing.push('Strict-Transport-Security');
      if (!hasSecurityHeader(evidence, 'x-frame-options')) missing.push('X-Frame-Options');
      if (missing.length === 0) return [];
      return [
        {
          category: 'gap',
          severity: missing.length >= 2 ? 'moderate' : 'minor',
          confidence: 'high',
          statement: `The response from ${evidence.startUrl} is missing these security headers: ${missing.join(', ')}.`,
          evidenceRefs: ['pages[0].headers'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingTitlePages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.title).length;
      if (count === 0) return [];
      return [
        {
          category: 'risk',
          severity: 'major',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} crawled page${evidence.pages.length === 1 ? '' : 's'} have no <title> tag — this hurts both SEO and browser-tab identification.`,
          evidenceRefs: ['pages[].title'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingMetaDescriptionPages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasMetaDescription).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} crawled page${evidence.pages.length === 1 ? '' : 's'} have no meta description — search engines will fall back to auto-generated snippet text.`,
          evidenceRefs: ['pages[].hasMetaDescription'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingViewportPages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasViewportMeta).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'medium',
          statement: `${count} of ${evidence.pages.length} crawled page${evidence.pages.length === 1 ? '' : 's'} have no viewport meta tag — a strong signal the page isn't set up for responsive/mobile layout.`,
          evidenceRefs: ['pages[].hasViewportMeta'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'thinContentPages',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const thin = evidence.pages.filter((p) => p.wordCount < THIN_CONTENT_WORD_THRESHOLD);
      if (thin.length === 0) return [];
      return [
        {
          category: 'opportunity',
          severity: 'minor',
          confidence: 'medium',
          statement: `${thin.length} crawled page${thin.length === 1 ? '' : 's'} have under ${THIN_CONTENT_WORD_THRESHOLD} words of visible text (this counts only static HTML — JS-rendered content isn't captured, see the report's honest scope note).`,
          evidenceRefs: ['pages[].wordCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'pagesFailedToFetch',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.pagesFailed === 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'high',
          statement: `${evidence.pagesFailed} linked page${evidence.pagesFailed === 1 ? '' : 's'} discovered during the crawl failed to load.`,
          evidenceRefs: ['pagesFailed'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'disallowedPathsSkipped',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.disallowedPathsSkipped.length === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `robots.txt disallows crawling ${evidence.disallowedPathsSkipped.length} path${evidence.disallowedPathsSkipped.length === 1 ? '' : 's'} this run respected and did not visit (e.g. "${evidence.disallowedPathsSkipped[0]}").`,
          evidenceRefs: ['disallowedPathsSkipped'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'crawlBoundHit',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.hitCrawlBound) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `This report only covers ${evidence.pages.length} page${evidence.pages.length === 1 ? '' : 's'} — the crawl stopped at its page/depth/time bound, not because the site had no more linked pages.`,
          evidenceRefs: ['hitCrawlBound'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'jsRenderedContentGap',
    evaluate(): Omit<Finding, 'id'>[] {
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement:
            'This crawl fetched raw HTML only — it did not execute JavaScript, so client-side-rendered content, interactive behavior, and visual layout are not covered by this report.',
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
];

function toPageSummary(page: WebsiteEvidence['pages'][number]): WebsitePageSummary {
  return {
    url: page.url,
    statusCode: page.statusCode,
    title: page.title,
    hasMetaDescription: page.hasMetaDescription,
    hasViewportMeta: page.hasViewportMeta,
    wordCount: page.wordCount,
    internalLinkCount: page.internalLinkCount,
    externalLinkCount: page.externalLinkCount,
  };
}

/**
 * Assembles WebsiteReportFields purely from already-gathered evidence — same discipline as
 * repositoryReportBuilder. `findings` is accepted (per ReportBuilder's shared signature) but this
 * builder doesn't need to branch on it — the domain fields are facts, not scored conclusions.
 */
export const websiteReportBuilder: ReportBuilder<WebsiteEvidence, WebsiteReportFields> = {
  build(_subject, evidence, _findings): WebsiteReportFields {
    return {
      startUrl: evidence.startUrl,
      origin: evidence.origin,
      usesHttps: evidence.usesHttps,
      robotsTxtFound: evidence.robotsTxtFound,
      disallowedPathsSkipped: evidence.disallowedPathsSkipped,
      pagesVisited: evidence.pages.length,
      pagesFailed: evidence.pagesFailed,
      hitCrawlBound: evidence.hitCrawlBound,
      securityHeaders: {
        contentSecurityPolicy: hasSecurityHeader(evidence, 'content-security-policy'),
        strictTransportSecurity: hasSecurityHeader(evidence, 'strict-transport-security'),
        xFrameOptions: hasSecurityHeader(evidence, 'x-frame-options'),
      },
      pages: evidence.pages.map(toPageSummary),
    };
  },
};
