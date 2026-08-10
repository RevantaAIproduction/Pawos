import { crawlSite, type PageFetcher, type CrawledPage } from '../../crawl/SiteCrawler';

/**
 * Real, already-gathered facts about a page — extracted from its actual fetched HTML/headers,
 * never a guess about content the crawl didn't fetch (e.g. JS-rendered markup — see
 * SiteCrawler.httpPageFetcher's disclosed scope note).
 */
export type WebsitePageEvidence = {
  url: string;
  statusCode: number;
  title: string | null;
  hasMetaDescription: boolean;
  hasViewportMeta: boolean;
  wordCount: number;
  internalLinkCount: number;
  externalLinkCount: number;
  headers: Record<string, string>;
};

export type WebsiteEvidence = {
  startUrl: string;
  origin: string;
  usesHttps: boolean;
  robotsTxtFound: boolean;
  disallowedPathsSkipped: string[];
  hitCrawlBound: boolean;
  pagesFailed: number;
  pages: WebsitePageEvidence[];
};

const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_DESCRIPTION_PATTERN = /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i;
const VIEWPORT_META_PATTERN = /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i;
const HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
const TAG_PATTERN = /<[^>]+>/g;
const SCRIPT_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

function analyzePage(page: CrawledPage, origin: string): WebsitePageEvidence {
  const titleMatch = page.html.match(TITLE_PATTERN);
  const title = titleMatch?.[1]?.trim().replace(/\s+/g, ' ') || null;

  const textOnly = page.html.replace(SCRIPT_STYLE_PATTERN, ' ').replace(TAG_PATTERN, ' ');
  const wordCount = textOnly.split(/\s+/).filter(Boolean).length;

  let internalLinkCount = 0;
  let externalLinkCount = 0;
  let match: RegExpExecArray | null;
  HREF_PATTERN.lastIndex = 0;
  while ((match = HREF_PATTERN.exec(page.html))) {
    const href = match[1];
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('#')) continue;
    try {
      const resolved = new URL(href, page.url);
      if (resolved.origin === origin) internalLinkCount++;
      else externalLinkCount++;
    } catch {
      // malformed href — not counted either way rather than guessed
    }
  }

  return {
    url: page.url,
    statusCode: page.statusCode,
    title,
    hasMetaDescription: META_DESCRIPTION_PATTERN.test(page.html),
    hasViewportMeta: VIEWPORT_META_PATTERN.test(page.html),
    wordCount,
    internalLinkCount,
    externalLinkCount,
    headers: page.headers,
  };
}

/**
 * Gathers real evidence for Website Intelligence via a real, bounded, robots.txt-compliant crawl
 * (SiteCrawler) — the first concrete consumer of the shared EvidenceCorrelationReportEngine
 * outside Repository Intelligence (see AnalyzeWebsitePlugin/CrawlWebsitePlugin). `fetcher` is
 * injectable so tests can point it at a real local HTTP server instead of the live network.
 */
export async function gatherWebsiteEvidence(
  input: { url: string; maxPages?: number; maxDepth?: number; timeoutBudgetMs?: number },
  fetcher?: PageFetcher
): Promise<WebsiteEvidence> {
  const bounds = {
    maxPages: input.maxPages ?? 1,
    maxDepth: input.maxDepth ?? 1,
    timeoutBudgetMs: input.timeoutBudgetMs ?? 20000,
  };
  const origin = new URL(input.url).origin;
  const crawl = fetcher ? await crawlSite(input.url, bounds, fetcher) : await crawlSite(input.url, bounds);

  return {
    startUrl: input.url,
    origin,
    usesHttps: origin.startsWith('https://'),
    robotsTxtFound: crawl.robotsTxtFound,
    disallowedPathsSkipped: crawl.disallowedPathsSkipped,
    hitCrawlBound: crawl.hitCrawlBound,
    pagesFailed: crawl.failedUrls.length,
    pages: crawl.pages.map((page) => analyzePage(page, origin)),
  };
}
