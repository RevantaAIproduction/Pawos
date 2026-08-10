import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { gatherWebsiteEvidence } from './websiteEvidence';

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
  <title>Home Page</title>
  <meta name="description" content="A real test page.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="content-security-policy" content="default-src 'self'">
</head>
<body>
  <p>This is a real paragraph of visible page content used to check word counting behaves reasonably for a page with a normal amount of prose text on it, well past the thin-content threshold used elsewhere in the rubric.</p>
  <a href="/page2">Page Two</a>
  <a href="https://external.example/page">External</a>
</body>
</html>`;

const THIN_PAGE = `<html><body>Too short.</body></html>`;

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(404);
    res.end();
    return;
  }
  if (url === '/') {
    res.writeHead(200, {
      'content-type': 'text/html',
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=63072000',
    });
    res.end(HOME_PAGE);
    return;
  }
  if (url === '/page2') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(THIN_PAGE);
    return;
  }
  res.writeHead(404);
  res.end();
}

describe('gatherWebsiteEvidence (real local HTTP server, real fetch, no mocks)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('extracts real title/meta/viewport/link facts for a single-page fetch', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherWebsiteEvidence({ url: server.origin, maxPages: 1, maxDepth: 0 });

    expect(evidence.pages).toHaveLength(1);
    const home = evidence.pages[0]!;
    expect(home.title).toBe('Home Page');
    expect(home.hasMetaDescription).toBe(true);
    expect(home.hasViewportMeta).toBe(true);
    expect(home.internalLinkCount).toBe(1);
    expect(home.externalLinkCount).toBe(1);
    expect(home.wordCount).toBeGreaterThan(20);
    expect(home.headers['content-security-policy']).toBeDefined();
    expect(home.headers['strict-transport-security']).toBeDefined();
    expect(evidence.usesHttps).toBe(false); // real local server is http://
  });

  it('crawls a second page and reports its honestly-thinner content and missing meta/viewport', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherWebsiteEvidence({ url: server.origin, maxPages: 5, maxDepth: 1 });

    const page2 = evidence.pages.find((p) => p.url === `${server.origin}/page2`);
    expect(page2).toBeDefined();
    expect(page2?.title).toBeNull();
    expect(page2?.hasMetaDescription).toBe(false);
    expect(page2?.hasViewportMeta).toBe(false);
    expect(page2?.wordCount).toBeLessThan(10);
  });

  it('reports a fetch failure honestly rather than fabricating a page', async () => {
    const evidence = await gatherWebsiteEvidence({ url: 'http://127.0.0.1:1', maxPages: 1, maxDepth: 0 });
    expect(evidence.pages).toHaveLength(0);
    expect(evidence.pagesFailed).toBeGreaterThan(0);
  });
});
