import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-build-ent-'));
vi.mock('electron', () => ({ app: { getPath: () => userDataDir } }));

import { entitlementService } from './EntitlementService';
import { buildAccessStore } from './BuildAccessStore';
import { subscriptionStore } from './SubscriptionStore';
import { usageEventStore } from './UsageEventStore';
import { creditStore } from './CreditStore';
import { rollingUsageGate } from './RollingUsageGate';
import type { NormalizedUsageRecord } from '../../shared/billing/UsageMeteringTypes';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function record(overrides: Partial<NormalizedUsageRecord>): NormalizedUsageRecord {
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
    normalizedCompute: 0,
    activeDurationMs: 0,
    timestamp: Date.now() - 1000,
    ...overrides,
  } as NormalizedUsageRecord;
}

function grantBuild(startsAt = Date.now() - DAY, endsAt = Date.now() + 55 * DAY) {
  buildAccessStore.set({ status: 'active', cohortId: 'build-2026', startsAt, endsAt, revokedAt: null, syncedAt: Date.now() });
}

describe('PawOS Build — effective tier resolution and enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    buildAccessStore.clear();
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ tier: 'go', status: 'none' } as any);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(usageEventStore, 'getActiveWindowStartAt').mockReturnValue(Date.now() - HOUR);
    vi.spyOn(usageEventStore, 'getWeeklyCycleStartAt').mockReturnValue(Date.now() - DAY);
    vi.spyOn(usageEventStore, 'getGoCycleStatus').mockReturnValue({ cycleStartAt: Date.now() - DAY, refreshesUsed: 0 });
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({ purchasedUsageCreditsUsd: 0 } as any);
    while (rollingUsageGate.inflightCount > 0) rollingUsageGate.releaseSlot();
  });

  afterEach(() => {
    buildAccessStore.clear();
    vi.restoreAllMocks();
  });

  it('resolves effectiveTier "build" (not Go) while the base subscription tier stays "go"', () => {
    grantBuild();
    expect(entitlementService.baseTier()).toBe('go');
    expect(entitlementService.effectiveTier()).toBe('build');
    const snapshot = entitlementService.getSnapshot();
    expect(snapshot.tier).toBe('build');
    expect(snapshot.baseTier).toBe('go');
    expect(snapshot.buildAccess?.status).toBe('active');
    expect(entitlementService.getEntitlements().tier).toBe('build');
  });

  it('grants exactly the Build feature set and models', () => {
    grantBuild();
    const { features, models } = entitlementService.getEntitlements();
    for (const f of ['advancedRuntimes', 'basicWorkspace', 'basicFileManagement', 'connectGithub', 'connectVercel', 'connectGoogleWorkspace', 'connectMicrosoft', 'atsScoring', 'resumeRewriting', 'resumeGeneration', 'jobSearch'] as const) {
      expect(features).toContain(f);
    }
    for (const f of ['autonomousTaskBilling', 'autonomousPlanBypass', 'connectSlack', 'connectJira', 'connectLinear', 'companionStudio', 'mobilePairing', 'crossDeviceSync', 'sharedWorkspaces', 'organizationMembers', 'adminControls', 'teamBilling', 'governanceAuditLog', 'ssoConfiguration', 'organizationCrossDeviceAlerts'] as const) {
      expect(features).not.toContain(f);
    }
    expect(models).toEqual(['paw-flash', 'paw-swift', 'paw-core', 'paw-vision', 'paw-voice', 'paw-memory']);
    expect(entitlementService.isModelAvailable('paw-fable')).toBe(false);
    expect(entitlementService.getRuntimeEntitlements().sort()).toEqual(['browser', 'coding']);
  });

  it('Autonomous Work / Ticket System stay unavailable to Build', () => {
    grantBuild();
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(false);
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(false);
  });

  it('uses Build capacity in the real generation decision: below limits → allowed', () => {
    grantBuild();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([record({ normalizedCompute: (100) * 10 / 3, activeDurationMs: HOUR })]);
    const check = entitlementService.checkGeneration();
    expect(check.allowed).toBe(true);
    expect(check.usage.limit5h).toBe(500);
    expect(check.usage.limit7d).toBe(1500);
  });

  it.each([
    ['500 PC in the current 5-hour window', record({ normalizedCompute: (500) * 10 / 3 }), '5-hour Paw Compute limit reached'],
    ['1,500 PC this week', record({ normalizedCompute: (1500) * 10 / 3, timestamp: Date.now() - 2 * HOUR }), 'Weekly limit reached'],
    ['5 active hours in the current window', record({ activeDurationMs: 5 * HOUR }), '5-hour active-use limit reached'],
    ['15 active hours this week', record({ activeDurationMs: 15 * HOUR, timestamp: Date.now() - 2 * HOUR }), 'Weekly limit reached'],
  ])('blocks at %s', (_label, usage, reason) => {
    grantBuild();
    vi.spyOn(usageEventStore, 'list').mockReturnValue([usage]);
    const check = entitlementService.checkGeneration();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain(reason);
    expect(check.reason).not.toContain('purchase');
    expect(entitlementService.hasCreditsRemaining()).toBe(false);
  });

  it('purchased Paw Compute continues Build past its limit in weeks 1–7, and on Go', () => {
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({ purchasedUsageCreditsUsd: 50 } as any);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([record({ normalizedCompute: (1500) * 10 / 3, timestamp: Date.now() - 2 * HOUR })]);

    grantBuild();
    expect(entitlementService.isBuildFinalWeek()).toBe(false);
    const build = entitlementService.checkGeneration();
    expect(build.allowed).toBe(true);
    expect(build.purchasedContinuation).toBe(true);

    buildAccessStore.clear(); // same usage on base tier Go
    const go = entitlementService.checkGeneration();
    expect(go.allowed).toBe(true);
    expect(go.purchasedContinuation).toBe(true);
  });

  it('in Build\'s final (no-reset) week purchases cannot continue it — the way on is upgrading to Pro', () => {
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({ purchasedUsageCreditsUsd: 50 } as any);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([record({ normalizedCompute: (1500) * 10 / 3, timestamp: Date.now() - 2 * HOUR })]);
    const start = Date.now() - 52 * DAY; // day 52 of 56: the final week 8 (days 50–56)
    grantBuild(start, start + 56 * DAY);

    expect(entitlementService.isBuildFinalWeek()).toBe(true);
    expect(entitlementService.canContinueOnPurchasedCompute()).toBe(false);
    const check = entitlementService.checkGeneration();
    expect(check.allowed).toBe(false);
    expect(check.purchasedContinuation).toBe(false);
    expect(check.reason).toContain('will not reset again');
    expect(check.reason).toContain('Upgrade to Pro');
    expect(entitlementService.getSnapshot().buildFinalWeek).toBe(true);
  });

  it('a paid plan wins over Build — upgrading to Pro takes effect immediately', () => {
    grantBuild();
    expect(entitlementService.effectiveTier()).toBe('build');
    vi.spyOn(subscriptionStore, 'getEffective').mockReturnValue({ tier: 'pro', status: 'active' } as any);
    expect(entitlementService.effectiveTier()).toBe('pro');
    expect(entitlementService.checkGeneration().usage.limit7d).toBe(5000);
  });

  it('Paw Fable is refused for Build even with a purchased balance', () => {
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({ purchasedUsageCreditsUsd: 50 } as any);
    grantBuild();
    const check = entitlementService.checkGeneration('paw-fable');
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('not included in PawOS Build');
  });

  it('falls back to the base tier the moment Build expires — Build capacity and features disappear', () => {
    grantBuild(Date.now() - 56 * DAY, Date.now() - 1);
    expect(entitlementService.effectiveTier()).toBe('go');
    const { features } = entitlementService.getEntitlements();
    expect(features).not.toContain('atsScoring');
    expect(entitlementService.checkGeneration().usage.limit7d).toBe(1000); // Go's cycle limit, not Build's 1,500
    expect(entitlementService.getSnapshot().tier).toBe('go');
  });

  it('revoked or none states never resolve to Build', () => {
    buildAccessStore.set({ status: 'revoked', cohortId: 'x', startsAt: Date.now() - DAY, endsAt: Date.now() + DAY, revokedAt: Date.now(), syncedAt: Date.now() });
    expect(entitlementService.effectiveTier()).toBe('go');
    buildAccessStore.set({ status: 'none', cohortId: null, startsAt: null, endsAt: null, revokedAt: null, syncedAt: Date.now() });
    expect(entitlementService.effectiveTier()).toBe('go');
  });

  it('a hand-edited local subscription.json "buildEntitlement" grants nothing — Build comes only from the server', () => {
    vi.restoreAllMocks();
    const file = path.join(userDataDir, 'billing', 'subscription.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({ tier: 'go', status: 'none', runtimeEntitlementPolicyVersion: 1, buildEntitlement: { active: true, cohortStartDate: Date.now(), includedPc: 999999 } })
    );
    subscriptionStore.init();
    expect(entitlementService.effectiveTier()).toBe('go');
    expect(entitlementService.getEntitlements().features).not.toContain('atsScoring');
    // …and the legacy overlay is scrubbed from disk.
    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).buildEntitlement).toBeUndefined();
  });
});
