import { beforeAll, describe, expect, it, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import type { AddressInfo } from 'net';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-analyze-website-test-'));
  return { app: { getPath: () => tmp } };
});

import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import { analyzeWebsitePlugin } from './AnalyzeWebsitePlugin';
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

describe('AnalyzeWebsitePlugin — full evidence -> correlate -> report -> persist pipeline', () => {
  let close: (() => Promise<void>) | undefined;

  beforeAll(() => memoryGraphStore.init());

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('produces a real report and persists it to the Memory Graph for a real local page', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>Test Site</title></head><body>Hello world.</body></html>');
    });
    close = server.close;

    const result = await analyzeWebsitePlugin.execute({ type: 'analyzeWebsite', url: server.origin });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const report = result.data as IntelligenceReport<WebsiteReportFields>;
    expect(report.engineId).toBe('website');
    expect(report.subject).toBe(server.origin);
    expect(report.domain.startUrl).toBe(server.origin);
    expect(report.domain.pagesVisited).toBe(1);
    expect(report.approvalRequired).toBe(false);
    expect(typeof report.overallScore).toBe('number');

    const persisted = findLatestIntelligenceReport('website', server.origin);
    expect(persisted).toBeDefined();
    expect((persisted?.attributes as { report: IntelligenceReport }).report.subject).toBe(server.origin);
  });

  it('reports a clear, honest failure when the site is unreachable', async () => {
    const result = await analyzeWebsitePlugin.execute({ type: 'analyzeWebsite', url: 'http://127.0.0.1:1' });
    expect(result.ok).toBe(false);
  });

  it('surfaces an invalid-URL requirement instead of executing blind', () => {
    const requirements = analyzeWebsitePlugin.requirements({ type: 'analyzeWebsite', url: 'not-a-url' });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.message).toMatch(/valid http/i);
  });
});
