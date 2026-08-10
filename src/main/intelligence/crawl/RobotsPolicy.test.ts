import { describe, expect, it, afterEach } from 'vitest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { RobotsPolicy, parseRobotsTxt } from './RobotsPolicy';

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

describe('parseRobotsTxt', () => {
  it('collects Disallow rules from the wildcard user-agent group', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin\nDisallow: /private\n');
    expect(rules.disallow).toEqual(['/admin', '/private']);
  });

  it('ignores directives outside any relevant user-agent group', () => {
    const rules = parseRobotsTxt('User-agent: Googlebot\nDisallow: /only-for-google\n\nUser-agent: *\nDisallow: /for-everyone\n');
    expect(rules.disallow).toEqual(['/for-everyone']);
  });

  it('honors a PawOS-specific group', () => {
    const rules = parseRobotsTxt('User-agent: PawOS\nDisallow: /paw-blocked\n');
    expect(rules.disallow).toEqual(['/paw-blocked']);
  });

  it('parses Crawl-delay as milliseconds', () => {
    const rules = parseRobotsTxt('User-agent: *\nCrawl-delay: 2\n');
    expect(rules.crawlDelayMs).toBe(2000);
  });

  it('strips comments and ignores blank lines', () => {
    const rules = parseRobotsTxt('# a comment\nUser-agent: *\n\nDisallow: /x # trailing comment\n');
    expect(rules.disallow).toEqual(['/x']);
  });
});

describe('RobotsPolicy (real local HTTP server)', () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it('loads real robots.txt over HTTP and enforces Disallow rules', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /blocked\n');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    close = server.close;

    const policy = new RobotsPolicy();
    const result = await policy.loadForOrigin(server.origin);
    expect(result.found).toBe(true);
    expect(policy.isAllowed(`${server.origin}/blocked/page`)).toBe(false);
    expect(policy.isAllowed(`${server.origin}/allowed/page`)).toBe(true);
  });

  it('reports found:false and allows everything when robots.txt is missing (404)', async () => {
    const server = await startServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    close = server.close;

    const policy = new RobotsPolicy();
    const result = await policy.loadForOrigin(server.origin);
    expect(result.found).toBe(false);
    expect(policy.isAllowed(`${server.origin}/anything`)).toBe(true);
  });

  it('waitForRateLimit actually waits at least the parsed Crawl-delay before resolving a second time', async () => {
    const server = await startServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nCrawl-delay: 0.2\n');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    close = server.close;

    const policy = new RobotsPolicy();
    await policy.loadForOrigin(server.origin);

    await policy.waitForRateLimit(server.origin); // first call — no prior request, resolves immediately
    const startedAt = Date.now();
    await policy.waitForRateLimit(server.origin); // second call — must wait out the crawl-delay
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(180); // small tolerance below the 200ms delay
  });

  it('falls back to the real 500ms default delay when robots.txt has no Crawl-delay directive', async () => {
    const server = await startServer((_req, res) => {
      // No robots.txt at all — found:false, so isAllowed()/waitForRateLimit() fall back to
      // built-in defaults rather than anything parsed, exercising DEFAULT_MIN_DELAY_MS directly
      // rather than the robots.txt-supplied override path the test above already covers.
      res.writeHead(404);
      res.end();
    });
    close = server.close;

    const policy = new RobotsPolicy();
    await policy.loadForOrigin(server.origin);

    await policy.waitForRateLimit(server.origin); // first call — no prior request, resolves immediately
    const startedAt = Date.now();
    await policy.waitForRateLimit(server.origin); // second call — must wait out the 500ms default
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(470); // small tolerance below the 500ms default
  }, 10_000);
});
