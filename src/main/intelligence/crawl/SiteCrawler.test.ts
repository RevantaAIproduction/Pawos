import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { crawlSite, httpPageFetcher, type PageFetcher } from './SiteCrawler';

function startServer(handler: http.RequestListener): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

const PAGES: Record<string, string> = {
  '/': '<html><head><title>Home</title></head><body><a href="/about">About</a> <a href="/contact">Contact</a> <a href="https://external.example/">External</a></body></html>',
  '/about': '<html><head><title>About</title></head><body><a href="/">Home</a> <a href="/deep1">Deep 1</a> <a href="/broken">Broken</a></body></html>',
  '/contact': '<html><head><title>Contact</title></head><body><a href="/">Home</a></body></html>',
  '/deep1': '<html><head><title>Deep 1</title></head><body><a href="/deep2">Deep 2</a></body></html>',
  '/deep2': '<html><head><title>Deep 2</title></head><body>No more links here.</body></html>',
};

function siteHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(404);
    res.end();
    return;
  }
  if (url === '/broken') {
    res.writeHead(500);
    res.end('broken');
    return;
  }
  const html = PAGES[url];
  if (!html) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
}

describe('crawlSite (real local HTTP server, real fetch, no mocks)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('follows same-origin links up to maxDepth, skips cross-origin links, and honestly records a real 500 response rather than dropping it', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    // Real link depths from "/": about/contact are depth 1 (direct links); deep1 is depth 2
    // (only linked from "/about", itself depth 1); deep2 is depth 3 (only linked from "/deep1").
    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 2, timeoutBudgetMs: 10_000 }, httpPageFetcher);

    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain(`${server.origin}/`);
    expect(urls).toContain(`${server.origin}/about`);
    expect(urls).toContain(`${server.origin}/contact`);
    expect(urls).toContain(`${server.origin}/deep1`); // depth 2 — within the maxDepth: 2 bound
    expect(urls).not.toContain(`${server.origin}/deep2`); // depth 3 — beyond the bound
    expect(urls.some((u) => u.includes('external.example'))).toBe(false);

    // A real HTTP 500 response is still a real fetched page (not a transport failure) — the
    // crawler reports its actual status code rather than silently dropping or miscategorizing it.
    const broken = result.pages.find((p) => p.url === `${server.origin}/broken`);
    expect(broken?.statusCode).toBe(500);
  });

  it('respects maxDepth — pages only reachable one hop deeper than the bound are not visited', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 1, timeoutBudgetMs: 10_000 }, httpPageFetcher);

    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain(`${server.origin}/about`); // depth 1 — within the bound
    expect(urls).not.toContain(`${server.origin}/deep1`); // depth 2 — one hop beyond maxDepth: 1
  });

  it('respects maxPages and honestly reports hitCrawlBound', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    const result = await crawlSite(server.origin, { maxPages: 2, maxDepth: 2, timeoutBudgetMs: 10_000 }, httpPageFetcher);

    expect(result.pages.length).toBeLessThanOrEqual(2);
    expect(result.hitCrawlBound).toBe(true);
  });

  it('records a genuine transport-level fetch failure in failedUrls without aborting the rest of the crawl', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    // A real PageFetcher (dependency-injected, same as production wiring) that fails
    // deterministically for one specific URL — the same shape a real network/DNS failure takes,
    // without needing to fabricate an actually-unreachable host mid-crawl.
    const flakyFetcher: PageFetcher = {
      fetch(url: string) {
        if (url.endsWith('/about')) return Promise.resolve({ ok: false, reason: 'simulated connection reset' });
        return httpPageFetcher.fetch(url);
      },
    };

    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 2, timeoutBudgetMs: 10_000 }, flakyFetcher);

    expect(result.failedUrls.some((f) => f.url === `${server.origin}/about` && f.reason === 'simulated connection reset')).toBe(true);
    // The rest of the crawl still completes — one failed page doesn't abort the traversal.
    expect(result.pages.map((p) => p.url)).toContain(`${server.origin}/contact`);
  });

  it('never revisits the same URL twice (dedup)', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 3, timeoutBudgetMs: 10_000 }, httpPageFetcher);
    const urls = result.pages.map((p) => p.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('respects timeoutBudgetMs — a deliberately slow fetcher stops the crawl early with fewer pages than the real site has', async () => {
    const server = await startServer(siteHandler);
    close = server.close;

    // Real fetches through a real fetcher, each delayed by 120ms — with a 250ms budget and 5
    // real pages available (/, /about, /contact, /deep1, /deep2), only ~2 pages can complete
    // before the time budget trips, so this proves timeoutBudgetMs (not maxPages/maxDepth) is
    // what stopped the crawl.
    const slowFetcher: PageFetcher = {
      async fetch(url: string) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return httpPageFetcher.fetch(url);
      },
    };

    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 3, timeoutBudgetMs: 250 }, slowFetcher);

    expect(result.hitCrawlBound).toBe(true);
    expect(result.pages.length).toBeLessThan(5);
    expect(result.pages.length).toBeGreaterThan(0);
  });

  it('respects a robots.txt Disallow rule and records the skipped path honestly', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /about\n');
        return;
      }
      siteHandler(req, res);
    });
    close = server.close;

    const result = await crawlSite(server.origin, { maxPages: 20, maxDepth: 2, timeoutBudgetMs: 10_000 }, httpPageFetcher);

    expect(result.robotsTxtFound).toBe(true);
    const urls = result.pages.map((p) => p.url);
    expect(urls).not.toContain(`${server.origin}/about`);
    expect(result.disallowedPathsSkipped).toContain('/about');
  });
});
