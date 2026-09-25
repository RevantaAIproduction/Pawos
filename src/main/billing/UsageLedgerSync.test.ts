import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));
vi.mock('./DeviceIdentity', () => ({ deviceFingerprint: () => 'a'.repeat(64) }));

import { usageEventStore } from './UsageEventStore';
import { rollingUsageGate } from './RollingUsageGate';
import { syncUsageLedger } from './UsageLedgerSync';
import { setServerAccessToken } from '../auth/ServerSessionToken';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const DAY = 24 * 60 * 60 * 1000;

/** In-memory stand-in for sync_usage_ledger with the same rules as the real function. */
function fakeServer() {
  const ledgers = new Map<string, { events: Map<string, Record<string, unknown>>; anchors: Record<string, number | null> }>();
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const key = body.p_scope === 'device' ? `device:${body.p_device}` : 'account:user-1';
    const ledger = ledgers.get(key) ?? { events: new Map(), anchors: { weeklyCycleStartAt: null, activeWindowStartAt: null, goCycleStartAt: null, goFileAnchorAt: null } };
    ledgers.set(key, ledger);
    const now = Date.now();
    const inA = body.p_anchors ?? {};
    const a = ledger.anchors;
    a.weeklyCycleStartAt ??= inA.weeklyCycleStartAt ?? null;
    a.goFileAnchorAt ??= inA.goFileAnchorAt ?? null;
    if (a.goCycleStartAt === null) a.goCycleStartAt = inA.goCycleStartAt ?? null;
    else if (inA.goCycleStartAt && a.goCycleStartAt + 14 * DAY <= now && inA.goCycleStartAt > a.goCycleStartAt) a.goCycleStartAt = inA.goCycleStartAt;
    if (a.activeWindowStartAt === null) a.activeWindowStartAt = inA.activeWindowStartAt ?? null;
    for (const e of body.p_events ?? []) if (!ledger.events.has(e.id)) ledger.events.set(e.id, e);
    return new Response(JSON.stringify({ anchors: { ...a }, events: [...ledger.events.values()], serverNow: now }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, ledgers };
}

function record(normalizedCompute: number, at: number): NormalizedUsageRecord {
  return {
    usageEventId: `evt-${at}-${Math.random()}`,
    requestId: null,
    sessionId: null,
    runId: null,
    provider: 'gemini',
    model: 'gemini-flash-latest',
    requestType: 'conversationTurn',
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    totalTokens: 2,
    thoughtsTokens: null,
    normalizedCompute,
    activeDurationMs: 0,
    timestamp: at,
  };
}

/** Simulates the user deleting PawOS's local billing files and restarting the app. */
function deleteLocalFilesAndRestart() {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-ledger-'));
  usageEventStore.init();
  usageEventStore.setAccount(null);
  usageEventStore.setScopeResolver(() => 'device');
}

describe('Server copy of the usage ledger', () => {
  const env = { ...process.env };

  beforeEach(() => {
    deleteLocalFilesAndRestart();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'anon-key';
    setServerAccessToken('user-token');
    while (rollingUsageGate.inflightCount > 0) rollingUsageGate.releaseSlot();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setServerAccessToken(null);
    process.env = { ...env };
  });

  it('Go: deleting the local usage file does not give the free allowance back', async () => {
    fakeServer();
    const now = Date.now();
    usageEventStore.getGoCycleStatus(now - DAY); // cycle started yesterday
    usageEventStore.append(record(10_000, now - 60_000)); // 1,000 PC — Go's whole allowance
    expect(rollingUsageGate.canStartGeneration('go', undefined, now).allowed).toBe(false);
    await syncUsageLedger('device', now);

    deleteLocalFilesAndRestart();
    expect(rollingUsageGate.canStartGeneration('go', undefined, now).allowed).toBe(true); // local only: looks fresh…
    await syncUsageLedger('device', now);
    expect(rollingUsageGate.canStartGeneration('go', undefined, now).allowed).toBe(false); // …server restores it
  });

  it('Go: deleted file changes come back too, so the monthly file limit still applies', async () => {
    fakeServer();
    const now = Date.now();
    rollingUsageGate.isFileCapReached('go', now - DAY); // anchors the month
    for (let i = 0; i < 75; i++) usageEventStore.recordFileWrite(`C:\\p\\f${i}.ts`, { kind: 'create', lines: 5 }, now - 1000 - i);
    expect(rollingUsageGate.isFileCapReached('go', now)).toBe(true);
    await syncUsageLedger('device', now);

    deleteLocalFilesAndRestart();
    await syncUsageLedger('device', now);
    expect(rollingUsageGate.isFileCapReached('go', now)).toBe(true);
  });

  it('a restart after deleting files cannot start a fresh cycle early — the server keeps the old start', async () => {
    const { ledgers } = fakeServer();
    const now = Date.now();
    usageEventStore.getGoCycleStatus(now - 3 * DAY);
    await syncUsageLedger('device', now);

    deleteLocalFilesAndRestart();
    usageEventStore.getGoCycleStatus(now); // the wiped app would start a new cycle "now"
    await syncUsageLedger('device', now);
    expect(usageEventStore.getGoCycleStatus(now).cycleStartAt).toBe(now - 3 * DAY);
    expect(ledgers.get(`device:${'a'.repeat(64)}`)?.anchors.goCycleStartAt).toBe(now - 3 * DAY);
  });

  it('paid / Build usage follows the account — deleting its ledger file restores it', async () => {
    fakeServer();
    const now = Date.now();
    usageEventStore.setAccount('user-1');
    usageEventStore.setScopeResolver(() => 'account');
    usageEventStore.getWeeklyCycleStartAt(now - DAY);
    usageEventStore.append(record(50_000, now - 60_000)); // 5,000 PC — Pro's weekly limit
    expect(rollingUsageGate.canStartGeneration('pro', undefined, now).allowed).toBe(false);
    await syncUsageLedger('account', now);

    deleteLocalFilesAndRestart();
    usageEventStore.setAccount('user-1');
    usageEventStore.setScopeResolver(() => 'account');
    await syncUsageLedger('account', now);
    expect(rollingUsageGate.canStartGeneration('pro', undefined, now).allowed).toBe(false);
  });

  it('only uploads what changed since the last sync, and never Fable / background / autonomous usage', async () => {
    const { fetchMock } = fakeServer();
    const now = Date.now();
    usageEventStore.append(record(100, now - 2 * DAY));
    usageEventStore.append({ ...record(100, now - DAY), fable: true });
    usageEventStore.append({ ...record(100, now - DAY), requestType: 'backgroundTask' });
    usageEventStore.append({ ...record(100, now - DAY), runId: 'run-1' });
    await syncUsageLedger('device', now);
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(first.p_events).toHaveLength(1);

    usageEventStore.append(record(100, now + 10));
    await syncUsageLedger('device', now + 60_000);
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(second.p_events).toHaveLength(1);
  });

  it('signed out or offline: nothing breaks, the local ledger keeps working', async () => {
    setServerAccessToken(null);
    expect(await syncUsageLedger('device')).toBeNull();
    setServerAccessToken('user-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    usageEventStore.append(record(100, Date.now()));
    expect(await syncUsageLedger('device')).toBeNull();
    expect(usageEventStore.list()).toHaveLength(1);
  });
});
