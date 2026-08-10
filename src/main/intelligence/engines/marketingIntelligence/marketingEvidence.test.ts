import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { gatherMarketingEvidence } from './marketingEvidence';

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

const HOME_PAGE = `<html>
<head>
  <title>Home</title>
  <meta property="og:title" content="Home">
  <meta property="og:description" content="A real test page.">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">{"@type":"Organization"}</script>
  <link rel="icon" href="/favicon.ico">
  <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
</head>
<body>
  <a href="/about">About</a>
  <a href="https://facebook.com/mypage">Facebook</a>
  <a href="mailto:hello@example.com">Email us</a>
  <p>Sign up today and get started fast.</p>
</body>
</html>`;

const ABOUT_PAGE = `<html><head><title>About</title></head><body><a href="/">Home</a></body></html>`;

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(404);
    res.end();
    return;
  }
  if (url === '/sitemap.xml') {
    res.writeHead(200, { 'content-type': 'application/xml' });
    res.end('<?xml version="1.0"?><urlset></urlset>');
    return;
  }
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(HOME_PAGE);
    return;
  }
  if (url === '/about') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(ABOUT_PAGE);
    return;
  }
  res.writeHead(404);
  res.end();
}

function handlerNoSitemap(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === '/sitemap.xml') {
    res.writeHead(404);
    res.end();
    return;
  }
  handler(req, res);
}

describe('gatherMarketingEvidence (real local HTTP server, real fetch, no mocks)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('extracts real OG/Twitter/structured-data/analytics/CTA/social/contact/favicon facts and finds a real sitemap.xml', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherMarketingEvidence({ url: server.origin, maxPages: 1, maxDepth: 0 });

    expect(evidence.pages).toHaveLength(1);
    const home = evidence.pages[0]!;
    expect(home.hasOpenGraphTags).toBe(true);
    expect(home.hasTwitterCardTags).toBe(true);
    expect(home.hasStructuredData).toBe(true);
    expect(home.analyticsDetected).toContain('google-tag-manager');
    expect(home.ctaKeywordCount).toBeGreaterThanOrEqual(2); // "sign up" + "get started"
    expect(home.socialLinks).toContain('facebook.com');
    expect(home.hasContactInfo).toBe(true);
    expect(home.hasFavicon).toBe(true);
    expect(evidence.sitemapFound).toBe(true);
  });

  it('crawls a second page and reports its real, honestly-empty marketing signals', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherMarketingEvidence({ url: server.origin, maxPages: 5, maxDepth: 1 });

    const about = evidence.pages.find((p) => p.url === `${server.origin}/about`);
    expect(about).toBeDefined();
    expect(about?.hasOpenGraphTags).toBe(false);
    expect(about?.analyticsDetected).toHaveLength(0);
    expect(about?.ctaKeywordCount).toBe(0);
    expect(about?.socialLinks).toHaveLength(0);
    expect(about?.hasContactInfo).toBe(false);
    expect(about?.hasFavicon).toBe(false);
  });

  it('honestly reports a missing sitemap.xml rather than assuming one exists', async () => {
    const server = await startServer(handlerNoSitemap);
    close = server.close;

    const evidence = await gatherMarketingEvidence({ url: server.origin, maxPages: 1, maxDepth: 0 });
    expect(evidence.sitemapFound).toBe(false);
  });

  it('reports a fetch failure honestly rather than fabricating a page', async () => {
    const evidence = await gatherMarketingEvidence({ url: 'http://127.0.0.1:1', maxPages: 1, maxDepth: 0 });
    expect(evidence.pages).toHaveLength(0);
    expect(evidence.pagesFailed).toBeGreaterThan(0);
  });
});
