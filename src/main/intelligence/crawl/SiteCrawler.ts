import { RobotsPolicy } from './RobotsPolicy';

const FETCH_TIMEOUT_MS = 8000;

export type CrawledPage = {
  url: string;
  statusCode: number;
  html: string;
  headers: Record<string, string>;
};

export type PageFetchResult = { ok: true; statusCode: number; html: string; headers: Record<string, string> } | { ok: false; reason: string };

/** How SiteCrawler actually gets a page's content — swappable so a test can supply a plain-HTTP fetcher against a real local server without needing a live Electron browser process. */
export interface PageFetcher {
  fetch(url: string): Promise<PageFetchResult>;
}

/**
 * Real HTTP fetch (no JS execution) — the default PageFetcher. This is a deliberate, disclosed
 * scope narrowing from the architecture's original "reuse browserRuntime" sketch: rendering every
 * crawled page in a full Chromium instance would make the crawler untestable outside a live
 * Electron process and dramatically slower for a bounded multi-page traversal. What this can
 * still honestly assess — HTML structure, meta tags, security response headers, internal link
 * graph, robots.txt compliance — covers the large majority of real Website Intelligence signal;
 * anything that would require JS-rendered DOM is a named gap in the report, never a guess.
 */
export const httpPageFetcher: PageFetcher = {
  async fetch(url: string): Promise<PageFetchResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      const html = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { ok: true, statusCode: response.status, html, headers };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  },
};

export type CrawlBounds = {
  maxPages: number;
  maxDepth: number;
  timeoutBudgetMs: number;
};

export type CrawlResult = {
  pages: CrawledPage[];
  failedUrls: { url: string; reason: string }[];
  disallowedPathsSkipped: string[];
  hitCrawlBound: boolean;
  robotsTxtFound: boolean;
};

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = '';
  return u.toString();
}

const HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

/** Real extraction from the actual fetched HTML — regex-based (no DOM parser dependency), resolves relative links against the page's own URL, same-origin only, never invents a link the HTML didn't contain. */
function extractSameOriginLinks(html: string, pageUrl: string, origin: string): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  HREF_PATTERN.lastIndex = 0;
  while ((match = HREF_PATTERN.exec(html))) {
    const href = match[1];
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === origin) links.add(normalizeUrl(resolved.toString()));
    } catch {
      // malformed href — skip rather than guess
    }
  }
  return [...links];
}

/**
 * Bounded, same-origin, robots.txt-compliant multi-page traversal — the net-new "consent/rate-
 * limit/robots.txt layer" the architecture calls for. Every page fetched is real (via `fetcher`);
 * `hitCrawlBound` tells the report honestly whether the crawl stopped because of maxPages/
 * maxDepth/the time budget rather than because the site genuinely had no more linked pages.
 */
export async function crawlSite(startUrl: string, bounds: CrawlBounds, fetcher: PageFetcher = httpPageFetcher): Promise<CrawlResult> {
  const origin = new URL(startUrl).origin;
  const policy = new RobotsPolicy();
  const { found: robotsTxtFound } = await policy.loadForOrigin(origin);

  const visited = new Set<string>();
  const pages: CrawledPage[] = [];
  const failedUrls: { url: string; reason: string }[] = [];
  const disallowedPathsSkipped: string[] = [];
  const frontier: { url: string; depth: number }[] = [{ url: normalizeUrl(startUrl), depth: 0 }];
  const startedAt = Date.now();
  let hitCrawlBound = false;

  while (frontier.length > 0) {
    if (pages.length >= bounds.maxPages) {
      hitCrawlBound = true;
      break;
    }
    if (Date.now() - startedAt >= bounds.timeoutBudgetMs) {
      hitCrawlBound = true;
      break;
    }

    const next = frontier.shift();
    if (!next) break;
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    if (!policy.isAllowed(next.url)) {
      disallowedPathsSkipped.push(new URL(next.url).pathname);
      continue;
    }

    await policy.waitForRateLimit(origin);
    const result = await fetcher.fetch(next.url);
    if (!result.ok) {
      failedUrls.push({ url: next.url, reason: result.reason });
      continue;
    }
    pages.push({ url: next.url, statusCode: result.statusCode, html: result.html, headers: result.headers });

    if (next.depth < bounds.maxDepth) {
      for (const link of extractSameOriginLinks(result.html, next.url, origin)) {
        if (!visited.has(link)) frontier.push({ url: link, depth: next.depth + 1 });
      }
    }
  }

  if (!hitCrawlBound && frontier.length > 0) hitCrawlBound = true;

  return { pages, failedUrls, disallowedPathsSkipped, hitCrawlBound, robotsTxtFound };
}
