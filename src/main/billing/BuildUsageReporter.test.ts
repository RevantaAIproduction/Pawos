import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData, getVersion: () => '0.1.1' } }));

import { buildUsageReport, buildUsageReporter } from './BuildUsageReporter';
import { buildAccessStore } from './BuildAccessStore';
import { entitlementService } from './EntitlementService';
import { usageEventStore } from './UsageEventStore';
import { callRpcAsUser, setServerAccessToken } from '../auth/ServerSessionToken';

const DAY = 24 * 60 * 60 * 1000;

describe('Build usage reporting (admin visibility)', () => {
  const env = { ...process.env };

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-buildreport-'));
    usageEventStore.init();
    usageEventStore.setAccount(null);
    usageEventStore.setScopeResolver(() => 'device');
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'anon-key';
    buildUsageReporter.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setServerAccessToken(null);
    process.env = { ...env };
  });

  function activeBuild(start: number, end: number) {
    vi.spyOn(buildAccessStore, 'isActive').mockReturnValue(true);
    vi.spyOn(buildAccessStore, 'getStartsAt').mockReturnValue(start);
    vi.spyOn(buildAccessStore, 'getEndsAt').mockReturnValue(end);
    vi.spyOn(entitlementService, 'effectiveTier').mockReturnValue('build');
  }

  it('reports nothing unless PawOS Build is the active tier', () => {
    vi.spyOn(buildAccessStore, 'isActive').mockReturnValue(false);
    expect(buildUsageReport()).toBeNull();
  });

  it('includes Build limits, the hidden file count and whether this is the final (no-reset) week', () => {
    const now = Date.now();
    const start = now - 1000;
    activeBuild(start, start + 56 * DAY);
    for (let i = 0; i < 12; i++) usageEventStore.recordFileWrite(`C:\\p\\f${i}.ts`, { kind: 'create', lines: 3 }, now);

    const report = buildUsageReport(now)!;
    expect(report).toMatchObject({ weekPcLimit: 1500, windowPcLimit: 500, weekHoursLimit: 15, windowHoursLimit: 5, fileChangesUsed: 12, fileChangesCap: 155, noFurtherReset: false, appVersion: '0.1.1' });
    expect(report.weekResetsAt).toBe(start + 7 * DAY);

    const finalWeek = buildUsageReport(start + 52 * DAY)!;
    expect(finalWeek.noFurtherReset).toBe(true);
    expect(finalWeek.weekResetsAt).toBe(start + 56 * DAY);
  });

  it('sends the report as the signed-in user, and skips an unchanged repeat', async () => {
    activeBuild(Date.now() - 1000, Date.now() + 60 * DAY);
    setServerAccessToken('user-jwt');
    const fetchMock = vi.fn(async () => new Response('true', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await buildUsageReporter.flush()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/report_my_build_usage',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' }) }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.p_report.fileChangesCap).toBe(155);

    await buildUsageReporter.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('never throws — no session or a server error just logs', async () => {
    activeBuild(Date.now() - 1000, Date.now() + 60 * DAY);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await buildUsageReporter.flush()).toBe(false); // no token

    setServerAccessToken('user-jwt');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    expect(await buildUsageReporter.flush()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('callRpcAsUser refuses without a session and surfaces server errors', async () => {
    await expect(callRpcAsUser('submit_app_rating', { p_rating: 5 })).rejects.toThrow('Not signed in');
    setServerAccessToken('user-jwt');
    const ok = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(callRpcAsUser('submit_app_rating', { p_rating: 5 }, ok)).resolves.toBeNull();
    const bad = vi.fn(async () => new Response('invalid_rating', { status: 400 }));
    await expect(callRpcAsUser('submit_app_rating', { p_rating: 9 }, bad)).rejects.toThrow('invalid_rating');
  });
});
