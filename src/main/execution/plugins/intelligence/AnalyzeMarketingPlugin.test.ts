import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-analyze-marketing-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { analyzeMarketingPlugin } from './AnalyzeMarketingPlugin';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { MarketingReportFields } from '../../../../shared/intelligence/MarketingReportTypes';

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
  '/': '<html><head><title>Home</title><meta property="og:title" content="Home"></head><body><a href="/about">About</a></body></html>',
  '/about': '<html><head><title>About</title></head><body><a href="/">Home</a></body></html>',
};

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  if (url === '/robots.txt' || url === '/sitemap.xml') {
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

describe('AnalyzeMarketingPlugin', () => {
  let close: (() => Promise<void>) | undefined;

  beforeAll(() => memoryGraphStore.init());

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('requires confirmation every time — never remembers a prior approval', async () => {
    const server = await startServer(handler);
    close = server.close;

    const first = await analyzeMarketingPlugin.execute({ type: 'analyzeMarketing', url: server.origin });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.reason).toBe('requires-confirmation');

    const second = await analyzeMarketingPlugin.execute({ type: 'analyzeMarketing', url: server.origin });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('requires-confirmation');
  });

  it('reviews multiple real pages once confirmed, persists the report, and discloses the JS-rendered marketing gap', async () => {
    const server = await startServer(handler);
    close = server.close;

    const result = await analyzeMarketingPlugin.execute({ type: 'analyzeMarketing', url: server.origin, confirmed: true, maxPages: 10, maxDepth: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<MarketingReportFields>;
    expect(report.engineId).toBe('marketing');
    expect(report.domain.pagesReviewed).toBe(2);
    expect(report.approvalRequired).toBe(false);
    expect(report.findings.some((f) => f.provenance === 'requiresApiAccess')).toBe(true);

    const persisted = findLatestIntelligenceReport('marketing', server.origin);
    expect(persisted).toBeDefined();
    expect((persisted?.attributes as { report: IntelligenceReport }).report.subject).toBe(server.origin);
  });

  it('clamps maxPages/maxDepth to hard maximums regardless of what was requested', async () => {
    const server = await startServer(handler);
    close = server.close;

    const result = await analyzeMarketingPlugin.execute({
      type: 'analyzeMarketing',
      url: server.origin,
      confirmed: true,
      maxPages: 999,
      maxDepth: 999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const report = result.data as IntelligenceReport<MarketingReportFields>;
      expect(report.domain.pagesReviewed).toBeLessThanOrEqual(50);
    }
  });

  it('reports a clear, honest failure when the site is unreachable', async () => {
    const result = await analyzeMarketingPlugin.execute({ type: 'analyzeMarketing', url: 'http://127.0.0.1:1', confirmed: true });
    expect(result.ok).toBe(false);
  });

  it('surfaces an invalid-URL requirement instead of executing blind', () => {
    const requirements = analyzeMarketingPlugin.requirements({ type: 'analyzeMarketing', url: 'not-a-url' });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.message).toMatch(/valid http/i);
  });

  it('describes the pending confirmation with the actual (clamped) scope', () => {
    const description = analyzeMarketingPlugin.describeDone(
      { type: 'analyzeMarketing', url: 'https://example.com', maxPages: 999 },
      { ok: false, reason: 'requires-confirmation' }
    );
    expect(description).toContain('50'); // clamped from 999 to the hard max
  });
});
