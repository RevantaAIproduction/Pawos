/**
 * Website Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Every field here must trace
 * back to something websiteEvidence.ts actually read (a real HTTP response, a real robots.txt
 * fetch, a real HTML parse) — never a guess. Bounded, honest crawl stats (pagesVisited etc.) make
 * "how much of the site did you actually look at" visible rather than implied.
 */
export type WebsitePageSummary = {
  url: string;
  statusCode: number;
  title: string | null;
  hasMetaDescription: boolean;
  hasViewportMeta: boolean;
  wordCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
};

export type WebsiteReportFields = {
  startUrl: string;
  origin: string;
  usesHttps: boolean;
  robotsTxtFound: boolean;
  /** Paths this crawl actually skipped because robots.txt disallowed them — never crawled, never a guess about their content. */
  disallowedPathsSkipped: string[];
  pagesVisited: number;
  pagesFailed: number;
  /** True only when the crawl stopped because it hit maxPages/maxDepth/the time budget, not because it ran out of links — an honest "there is more we didn't look at" signal. */
  hitCrawlBound: boolean;
  securityHeaders: {
    contentSecurityPolicy: boolean;
    strictTransportSecurity: boolean;
    xFrameOptions: boolean;
  };
  pages: WebsitePageSummary[];
};
