import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { MarketingReportFields } from '../../../../shared/intelligence/MarketingReportTypes';
import type { MarketingEvidence } from './marketingEvidence';

const COMMERCIAL_INTENT_CTA_THRESHOLD = 3;

/**
 * Marketing Intelligence's deterministic rubric — same discipline as uxCorrelate.ts's
 * UX_CORRELATION_RULES: every rule reasons only over evidence gatherMarketingEvidence() already
 * collected (a real, bounded crawl reused from Website/UX Intelligence), never re-fetches, never
 * invents a finding it hasn't observed. Includes one genuinely 'inferred' finding (a conclusion
 * drawn from observed counts, not itself directly observed) to keep the Observed/Inferred/
 * Requires-Access distinction real rather than a rubber-stamped label.
 */
export const MARKETING_CORRELATION_RULES: CorrelationRule<MarketingEvidence>[] = [
  {
    id: 'missingOpenGraphTags',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasOpenGraphTags).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no Open Graph meta tags (og:title/og:description/og:image) — shared links will render with no preview image or title on social platforms.`,
          evidenceRefs: ['pages[].hasOpenGraphTags'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingTwitterCardTags',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasTwitterCardTags).length;
      if (count === 0) return [];
      return [
        {
          category: 'gap',
          severity: 'minor',
          confidence: 'high',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no Twitter Card meta tag — links shared on X/Twitter will fall back to a plain link preview.`,
          evidenceRefs: ['pages[].hasTwitterCardTags'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingStructuredData',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const count = evidence.pages.filter((p) => !p.hasStructuredData).length;
      if (count === 0) return [];
      return [
        {
          category: 'opportunity',
          severity: 'minor',
          confidence: 'medium',
          statement: `${count} of ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'} have no schema.org structured data (JSON-LD) — search engines have less to build rich result snippets from.`,
          evidenceRefs: ['pages[].hasStructuredData'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'noAnalyticsDetected',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const anyDetected = evidence.pages.some((p) => p.analyticsDetected.length > 0);
      if (anyDetected) return [];
      return [
        {
          category: 'gap',
          severity: 'moderate',
          confidence: 'medium',
          statement: `No known analytics/tracking script (Google Analytics, GTM, Meta Pixel, Hotjar, Segment, Mixpanel) was found in the raw HTML of any reviewed page — this site may not be able to measure real visitor behavior, though a script loaded dynamically after page load wouldn't appear here.`,
          evidenceRefs: ['pages[].analyticsDetected'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'noCtaDetected',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const total = evidence.pages.reduce((sum, p) => sum + p.ctaKeywordCount, 0);
      if (total > 0) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'medium',
          statement: `No common call-to-action phrasing (e.g. "sign up", "get started", "contact us") was found in the visible text of any reviewed page — visitors may have no clear next step.`,
          evidenceRefs: ['pages[].ctaKeywordCount'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'commercialIntentInferred',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const total = evidence.pages.reduce((sum, p) => sum + p.ctaKeywordCount, 0);
      if (total < COMMERCIAL_INTENT_CTA_THRESHOLD) return [];
      return [
        {
          category: 'strength',
          severity: 'info',
          confidence: 'medium',
          statement: `Across ${evidence.pages.length} reviewed page${evidence.pages.length === 1 ? '' : 's'}, ${total} conversion-oriented phrases were observed — this reads as a commercially-oriented site actively driving visitor action, though intent can't be fully confirmed from copy alone.`,
          evidenceRefs: ['pages[].ctaKeywordCount'],
          provenance: 'inferred',
        },
      ];
    },
  },
  {
    id: 'noSocialLinksDetected',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const anyDetected = evidence.pages.some((p) => p.socialLinks.length > 0);
      if (anyDetected) return [];
      return [
        {
          category: 'opportunity',
          severity: 'minor',
          confidence: 'medium',
          statement: 'No links to a known social media platform (Facebook, X/Twitter, LinkedIn, Instagram, YouTube, TikTok) were found on any reviewed page.',
          evidenceRefs: ['pages[].socialLinks'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingContactInfo',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const anyFound = evidence.pages.some((p) => p.hasContactInfo);
      if (anyFound) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'high',
          statement: 'No mailto: or tel: link was found on any reviewed page — visitors have no one-click way to email or call.',
          evidenceRefs: ['pages[].hasContactInfo'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingFavicon',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const anyFound = evidence.pages.some((p) => p.hasFavicon);
      if (anyFound) return [];
      return [
        {
          category: 'opportunity',
          severity: 'info',
          confidence: 'high',
          statement: 'No favicon <link> tag was found on any reviewed page — the site may show a generic/blank icon in browser tabs and bookmarks.',
          evidenceRefs: ['pages[].hasFavicon'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'missingSitemap',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (evidence.sitemapFound) return [];
      return [
        {
          category: 'gap',
          severity: 'minor',
          confidence: 'high',
          statement: `${evidence.startUrl}/sitemap.xml was not found — search engines have to rely purely on crawling and internal links to discover pages.`,
          evidenceRefs: ['sitemapFound'],
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
          statement: `${evidence.pagesFailed} linked page${evidence.pagesFailed === 1 ? '' : 's'} discovered during the review failed to load.`,
          evidenceRefs: ['pagesFailed'],
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
          statement: `This report only covers ${evidence.pages.length} page${evidence.pages.length === 1 ? '' : 's'} — the review stopped at its page/depth/time bound, not because the site had no more linked pages.`,
          evidenceRefs: ['hitCrawlBound'],
          provenance: 'observed',
        },
      ];
    },
  },
  {
    id: 'jsRenderedMarketingGap',
    evaluate(): Omit<Finding, 'id'>[] {
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement:
            'This review analyzed static HTML/response structure only — dynamically-injected marketing tooling (chat widgets, personalization, A/B test variants, analytics loaded via a later JS bundle) would require a live browser session and is not covered by this report.',
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
];

function toPageSummary(page: MarketingEvidence['pages'][number]) {
  return page;
}

/**
 * Assembles MarketingReportFields purely from already-gathered evidence — same discipline as
 * uxReportBuilder. `findings` is accepted (per ReportBuilder's shared signature) but this builder
 * doesn't need to branch on it — the domain fields are facts, not scored conclusions.
 */
export const marketingReportBuilder: ReportBuilder<MarketingEvidence, MarketingReportFields> = {
  build(_subject, evidence, _findings): MarketingReportFields {
    return {
      startUrl: evidence.startUrl,
      pagesReviewed: evidence.pages.length,
      pagesFailed: evidence.pagesFailed,
      hitCrawlBound: evidence.hitCrawlBound,
      sitemapFound: evidence.sitemapFound,
      pages: evidence.pages.map(toPageSummary),
    };
  },
};
