import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

import { usageEventStore } from './UsageEventStore';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

function record(pc: number): NormalizedUsageRecord {
  return {
    usageEventId: `evt-${Math.random()}`,
    requestId: `req-${Math.random()}`,
    sessionId: 's',
    runId: null,
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    requestType: 'conversationTurn',
    inputTokens: 1,
    outputTokens: 1,
    cachedInputTokens: 0,
    totalTokens: 2,
    thoughtsTokens: null,
    normalizedCompute: pc,
    activeDurationMs: 0,
    timestamp: Date.now(),
  } as NormalizedUsageRecord;
}

const total = () => usageEventStore.list().reduce((sum, r) => sum + r.normalizedCompute, 0);

describe('UsageEventStore — free usage per device, paid usage per account', () => {
  // Stand-in for the effective tier the real resolver (ipc.ts) reads from EntitlementService.
  const tierByAccount: Record<string, 'go' | 'pro'> = {};
  let signedIn: string | null = null;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-usage-scope-'));
    usageEventStore.init();
    usageEventStore.setAccount(null);
    signedIn = null;
    usageEventStore.setScopeResolver(() => (signedIn && tierByAccount[signedIn] === 'pro' ? 'account' : 'device'));
  });

  function signIn(accountId: string, tier: 'go' | 'pro') {
    tierByAccount[accountId] = tier;
    signedIn = accountId;
    usageEventStore.setAccount(accountId);
  }

  it('two FREE accounts on the same PC share one allowance — a new email does not reset it', () => {
    signIn('free-a', 'go');
    usageEventStore.append(record(90));
    expect(usageEventStore.getScope()).toBe('device');

    signIn('free-b', 'go');
    expect(total()).toBe(90);
  });

  it('a PAID account keeps its own usage — another account on the PC never sees it', () => {
    signIn('pro-a', 'pro');
    usageEventStore.append(record(400));
    expect(usageEventStore.getScope()).toBe('account');
    expect(total()).toBe(400);

    signIn('free-b', 'go');
    expect(total()).toBe(0);
  });

  it('switching from a paid account to an unpaid one falls back to the device\'s free usage', () => {
    signIn('free-a', 'go');
    usageEventStore.append(record(50)); // device (free) usage
    signIn('pro-a', 'pro');
    usageEventStore.append(record(300)); // pro-a's own usage
    expect(total()).toBe(300);

    signIn('free-c', 'go');
    expect(total()).toBe(50);

    signIn('pro-a', 'pro'); // back on the paid account: its own usage, untouched
    expect(total()).toBe(300);
  });

  it('signed out uses the device ledger', () => {
    signIn('free-a', 'go');
    usageEventStore.append(record(20));
    signedIn = null;
    usageEventStore.setAccount(null);
    expect(usageEventStore.getScope()).toBe('device');
    expect(total()).toBe(20);
  });

  it('persists each ledger to its own file', () => {
    signIn('pro-a', 'pro');
    usageEventStore.append(record(7));
    signIn('free-a', 'go');
    usageEventStore.append(record(3));

    const deviceFile = JSON.parse(fs.readFileSync(path.join(userData, 'billing', 'usage-events.json'), 'utf-8'));
    const accountFile = JSON.parse(fs.readFileSync(path.join(userData, 'billing', 'usage', 'pro-a.json'), 'utf-8'));
    expect(deviceFile.records.map((r: NormalizedUsageRecord) => r.normalizedCompute)).toEqual([3]);
    expect(accountFile.records.map((r: NormalizedUsageRecord) => r.normalizedCompute)).toEqual([7]);
  });
});
