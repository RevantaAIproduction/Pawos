import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { gatherUxEvidence } from './uxEvidence';

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

const HOME_PAGE = `<html lang="en">
<head><title>Home</title></head>
<body>
  <nav><a href="/about">About</a></nav>
  <h1>Welcome</h1>
  <img src="a.png" alt="A real description">
  <img src="b.png">
  <form>
    <label for="name">Name</label>
    <input id="name" type="text">
    <input type="email">
  </form>
  <button aria-label="Close">&#10005;</button>
  <button><svg></svg></button>
</body>
</html>`;

const ABOUT_PAGE = `<html>
<head><title>About</title></head>
<body><a href="/">Home</a></body>
</html>`;

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(404);
    res.end();
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

describe('gatherUxEvidence (real local HTTP server, real fetch, no mocks)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('extracts real heading/image/form/landmark/lang facts for a single-page fetch', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherUxEvidence({ url: server.origin, maxPages: 1, maxDepth: 0 });

    expect(evidence.pages).toHaveLength(1);
    const home = evidence.pages[0]!;
    expect(home.headingCounts.h1).toBe(1);
    expect(home.imageCount).toBe(2);
    expect(home.imagesWithAltCount).toBe(1);
    expect(home.formFieldCount).toBe(2);
    expect(home.labeledFormFieldCount).toBe(1);
    expect(home.hasNavLandmark).toBe(true);
    expect(home.hasLangAttribute).toBe(true);
    expect(home.emptyInteractiveElementCount).toBe(1);
  });

  it('crawls a second page and reports its real, honestly-different structure', async () => {
    const server = await startServer(handler);
    close = server.close;

    const evidence = await gatherUxEvidence({ url: server.origin, maxPages: 5, maxDepth: 1 });

    const about = evidence.pages.find((p) => p.url === `${server.origin}/about`);
    expect(about).toBeDefined();
    expect(about?.headingCounts.h1).toBe(0);
    expect(about?.hasNavLandmark).toBe(false);
    expect(about?.hasLangAttribute).toBe(false);
  });

  it('reports a fetch failure honestly rather than fabricating a page', async () => {
    const evidence = await gatherUxEvidence({ url: 'http://127.0.0.1:1', maxPages: 1, maxDepth: 0 });
    expect(evidence.pages).toHaveLength(0);
    expect(evidence.pagesFailed).toBeGreaterThan(0);
  });
});
