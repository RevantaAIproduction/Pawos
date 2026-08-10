/**
 * Marketing Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Every field here traces back
 * to something marketingEvidence.ts actually parsed out of a real fetched page's HTML (meta tags,
 * script tags, visible-text keyword counts, link hrefs) or a real sitemap.xml fetch — never a
 * guess. Deliberately scoped to static HTML structure: dynamically-injected marketing tooling
 * (chat widgets, personalization, A/B test variants, analytics loaded via a later JS bundle) isn't
 * captured (see the always-firing `jsRenderedMarketingGap` finding in marketingCorrelate.ts).
 */
export type MarketingPageSummary = {
  url: string;
  hasOpenGraphTags: boolean;
  hasTwitterCardTags: boolean;
  hasStructuredData: boolean;
  analyticsDetected: string[];
  ctaKeywordCount: number;
  socialLinks: string[];
  hasContactInfo: boolean;
  hasFavicon: boolean;
};

export type MarketingReportFields = {
  startUrl: string;
  pagesReviewed: number;
  pagesFailed: number;
  hitCrawlBound: boolean;
  sitemapFound: boolean;
  pages: MarketingPageSummary[];
};
