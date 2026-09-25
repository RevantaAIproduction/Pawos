import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAccessStore, parseBuildAccessResponse } from './BuildAccessStore';

const DAY = 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serverGrant(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    status: 'active',
    cohortId: 'build-2026',
    startsAt: new Date(now - DAY).toISOString(),
    endsAt: new Date(now + 60 * DAY).toISOString(),
    revokedAt: null,
    serverNow: new Date(now).toISOString(),
    ...overrides,
  };
}

describe('BuildAccessStore — server-authoritative PawOS Build access', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'anon-key';
    buildAccessStore.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    buildAccessStore.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('syncs an active grant with the user token via get_my_build_access and becomes active', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(serverGrant()));
    const result = await buildAccessStore.sync('user-jwt', fetchImpl);

    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/get_my_build_access',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer user-jwt', apikey: 'anon-key' }) })
    );
    expect(buildAccessStore.isActive()).toBe(true);
    expect(buildAccessStore.get()?.cohortId).toBe('build-2026');
  });

  it('stores the exact server start/end dates (end = start + 56 days, as granted server-side)', async () => {
    const startsAt = '2026-09-24T10:00:00.000Z';
    const endsAt = '2026-11-19T10:00:00.000Z'; // 24 Sep + 56 days
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant({ startsAt, endsAt, serverNow: '2026-09-25T00:00:00.000Z' })));
    expect(buildAccessStore.get()?.startsAt).toBe(Date.parse(startsAt));
    expect(buildAccessStore.get()?.endsAt).toBe(Date.parse(endsAt));
  });

  it.each(['none', 'expired', 'revoked'] as const)('status %s is never active', async (status) => {
    const body = status === 'none' ? { status, serverNow: new Date().toISOString() } : serverGrant({ status });
    const result = await buildAccessStore.sync('jwt', async () => jsonResponse(body));
    expect(result.ok).toBe(true);
    expect(buildAccessStore.isActive()).toBe(false);
  });

  it('expires locally at endsAt even without a re-sync (falls back immediately)', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant({ endsAt: new Date(now + 1000).toISOString(), serverNow: new Date(now).toISOString() })));
    expect(buildAccessStore.isActive(now)).toBe(true);
    expect(buildAccessStore.isActive(now + 1000)).toBe(false);
  });

  it('notifies listeners when access reaches its expiry', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant({ endsAt: new Date(now + 5000).toISOString(), serverNow: new Date(now).toISOString() })));
    const listener = vi.fn();
    buildAccessStore.onChange(listener);
    vi.advanceTimersByTime(6500);
    expect(listener).toHaveBeenCalled();
    expect(buildAccessStore.isActive()).toBe(false);
  });

  it('corrects for a wrong local clock using serverNow (a rolled-back clock cannot extend access)', async () => {
    const localNow = Date.now();
    const serverNow = localNow + 10 * DAY; // local clock is 10 days behind the server
    await buildAccessStore.sync(
      'jwt',
      async () => jsonResponse(serverGrant({ startsAt: new Date(serverNow - 55 * DAY).toISOString(), endsAt: new Date(serverNow + 5 * DAY).toISOString(), serverNow: new Date(serverNow).toISOString() }))
    );
    expect(buildAccessStore.isActive(localNow)).toBe(true);
    // 6 local days later = 16 server days later → past the server's endsAt.
    expect(buildAccessStore.isActive(localNow + 6 * DAY)).toBe(false);
  });

  it('clears access when the server rejects the token (fail closed)', async () => {
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant()));
    expect(buildAccessStore.isActive()).toBe(true);
    const result = await buildAccessStore.sync('expired-jwt', async () => jsonResponse({ message: 'JWT expired' }, 401));
    expect(result.ok).toBe(false);
    expect(buildAccessStore.get()).toBeNull();
    expect(buildAccessStore.isActive()).toBe(false);
  });

  it('clears access on a malformed response instead of guessing', async () => {
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant()));
    const result = await buildAccessStore.sync('jwt', async () => jsonResponse({ status: 'active', serverNow: new Date().toISOString() }));
    expect(result).toEqual({ ok: false, reason: 'Build access response has an invalid access window' });
    expect(buildAccessStore.isActive()).toBe(false);
  });

  it('keeps the last server-confirmed state on a pure network failure (still bounded by endsAt)', async () => {
    await buildAccessStore.sync('jwt', async () => jsonResponse(serverGrant()));
    const result = await buildAccessStore.sync('jwt', async () => {
      throw new TypeError('fetch failed');
    });
    expect(result.ok).toBe(false);
    expect(buildAccessStore.isActive()).toBe(true);
  });

  it('never activates without Supabase configuration or a token', async () => {
    delete process.env.SUPABASE_URL;
    expect((await buildAccessStore.sync('jwt', vi.fn())).ok).toBe(false);
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    expect((await buildAccessStore.sync('', vi.fn())).ok).toBe(false);
    expect(buildAccessStore.isActive()).toBe(false);
  });

  it('parseBuildAccessResponse rejects unknown statuses and missing serverNow', () => {
    expect(() => parseBuildAccessResponse({ status: 'gold', serverNow: new Date().toISOString() }, Date.now())).toThrow('Unknown Build access status');
    expect(() => parseBuildAccessResponse({ status: 'none' }, Date.now())).toThrow('serverNow');
  });
});
