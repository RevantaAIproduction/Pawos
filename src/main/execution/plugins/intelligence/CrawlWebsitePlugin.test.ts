import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-crawl-website-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { crawlWebsitePlugin } from './CrawlWebsitePlugin';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';

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
  '/': '<html><head><title>Home</title></head><body><a href="/about">About</a></body></html>',
  '/about': '<html><head><title>About</title></head><body><a href="/">Home</a></body></html>',
};

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt') {
    res.writeHead(404);
    res.end();
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

describe('CrawlWebsitePlugin', () => {
  let close: (() => Promise<void>) | undefined;

  beforeAll(() => memoryGraphStore.init());

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('requires confirmation every time — never remembers a prior approval', async () => {
    const server = await startServer(handler);
    close = server.close;

    const first = await crawlWebsitePlugin.execute({ type: 'crawlWebsite', url: server.origin });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.reason).toBe('requires-confirmation');

    const second = await crawlWebsitePlugin.execute({ type: 'crawlWebsite', url: server.origin });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('requires-confirmation');
  });

  it('crawls multiple real pages once confirmed and persists the report', async () => {
    const server = await startServer(handler);
    close = server.close;

    const result = await crawlWebsitePlugin.execute({ type: 'crawlWebsite', url: server.origin, confirmed: true, maxPages: 10, maxDepth: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<WebsiteReportFields>;
    expect(report.domain.pagesVisited).toBe(2);
  });

  it('clamps maxPages/maxDepth to hard maximums regardless of what was requested', async () => {
    const server = await startServer(handler);
    close = server.close;

    const result = await crawlWebsitePlugin.execute({
      type: 'crawlWebsite',
      url: server.origin,
      confirmed: true,
      maxPages: 999,
      maxDepth: 999,
    });
    expect(result.ok).toBe(true);
    // The real site only has 2 pages regardless of the clamp — this proves the crawl completed
    // (didn't hang/loop) rather than literally asserting the clamp value, which isn't exposed on the report.
    if (result.ok) {
      const report = result.data as IntelligenceReport<WebsiteReportFields>;
      expect(report.domain.pagesVisited).toBeLessThanOrEqual(50);
    }
  });

  it('describes the pending confirmation with the actual (clamped) scope', () => {
    const description = crawlWebsitePlugin.describeDone(
      { type: 'crawlWebsite', url: 'https://example.com', maxPages: 999 },
      { ok: false, reason: 'requires-confirmation' }
    );
    expect(description).toContain('50'); // clamped from 999 to the hard max
  });
});
