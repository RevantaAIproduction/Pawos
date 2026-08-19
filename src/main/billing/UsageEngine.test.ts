import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('electron', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pawos-usage-engine-test-'));
  return { app: { getPath: () => tmp } };
});

import { usageEngine } from './UsageEngine';
import { usageStore } from './UsageStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import { subscriptionStore } from './SubscriptionStore';
import { usageEventStore } from './UsageEventStore';

beforeAll(() => {
  usageQuotaConfigStore.init();
  usageStore.init();
});

describe('UsageQuotaConfigStore — config-driven quotas, no hardcoded Pro Max number', () => {
  it('resolves Pro Max as exactly 20x whatever Pro is currently configured to, not a separate stored number', () => {
    const proLimit = usageQuotaConfigStore.getEffectiveQuota('pro', undefined, 'codeExecution');
    const proMaxLimit = usageQuotaConfigStore.getEffectiveQuota('proMax', undefined, 'codeExecution');
    expect(proLimit).not.toBeNull();
    expect(proMaxLimit).toBe((proLimit as number) * 20);
  });

  it('proves the derivation is live, not a snapshot — changing Pro changes Pro Max automatically', () => {
    const before = usageQuotaConfigStore.getEffectiveQuota('proMax', undefined, 'browserAutomation');
    const config = usageQuotaConfigStore.get();
    usageQuotaConfigStore.applySyncedConfig({
      ...config,
      tiers: { ...config.tiers, pro: { ...config.tiers.pro, perUserQuotas: { ...config.tiers.pro.perUserQuotas, browserAutomation: { monthlyLimit: 9, weeklyLimit: null } } } },
    });
    const after = usageQuotaConfigStore.getEffectiveQuota('proMax', undefined, 'browserAutomation');
    expect(after).toBe(9 * 20);
    expect(after).not.toBe(before);
  });

  it('resolves Team Standard and Team Premium to genuinely different quotas via seatTier, not the same "team" number', () => {
    const standard = usageQuotaConfigStore.getEffectiveQuota('team', 'standard', 'repositoryAnalysis');
    const premium = usageQuotaConfigStore.getEffectiveQuota('team', 'premium', 'repositoryAnalysis');
    expect(standard).not.toBeNull();
    expect(premium).not.toBeNull();
    expect(premium as number).toBeGreaterThan(standard as number);
  });

  it('reports Go as fully blocked (0), never uncapped (null) or silently unset', () => {
    for (const capability of ['repositoryAnalysis', 'codeExecution', 'autonomousExecution'] as const) {
      expect(usageQuotaConfigStore.getEffectiveQuota('go', undefined, capability)).toBe(0);
    }
  });

  it('fills missing aiReasoning entries from defaults so an old quota cache never becomes unlimited', () => {
    const current = usageQuotaConfigStore.get();
    const withoutAiReasoning = {
      ...current,
      tiers: {
        ...current.tiers,
        go: {
          ...current.tiers.go,
          perUserQuotas: { ...current.tiers.go.perUserQuotas, aiReasoning: undefined },
        },
        pro: {
          ...current.tiers.pro,
          perUserQuotas: { ...current.tiers.pro.perUserQuotas, aiReasoning: undefined },
        },
        team: {
          ...current.tiers.team,
          perUserQuotas: { ...current.tiers.team.perUserQuotas, aiReasoning: undefined },
        },
      },
    };

    usageQuotaConfigStore.applySyncedConfig(withoutAiReasoning as unknown as typeof current);

    expect(usageQuotaConfigStore.getEffectiveQuota('go', undefined, 'aiReasoning')).toBe(20);
    expect(usageQuotaConfigStore.getEffectiveQuota('pro', undefined, 'aiReasoning')).not.toBeNull();
    expect(usageQuotaConfigStore.getEffectiveQuota('team', 'standard', 'aiReasoning')).not.toBeNull();
  });

  it('flags enterprise as pooled and every other real tier as not pooled', () => {
    expect(usageQuotaConfigStore.isPooled('enterprise')).toBe(true);
    expect(usageQuotaConfigStore.isPooled('go')).toBe(false);
    expect(usageQuotaConfigStore.isPooled('pro')).toBe(false);
    expect(usageQuotaConfigStore.isPooled('proMax')).toBe(false);
    expect(usageQuotaConfigStore.isPooled('team')).toBe(false);
  });
});

describe('UsageEngine — per-user (non-pooled) enforcement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('blocks every execution-class capability for Go, since its configured quota is 0', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    const result = usageEngine.canConsume('codeExecution', 1);
    expect(result).toEqual({ allowed: false, pooled: false, reason: expect.stringContaining('codeExecution') });
  });

  it('allows Pro to consume up to its configured limit, then blocks the request that would exceed it', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const limit = usageQuotaConfigStore.getEffectiveQuota('pro', undefined, 'longRunningWorkflow') as number;

    for (let i = 0; i < limit; i++) {
      const check = usageEngine.canConsume('longRunningWorkflow', 1);
      expect(check.allowed).toBe(true);
      usageEngine.recordUsage('longRunningWorkflow', 1);
    }

    const overLimit = usageEngine.canConsume('longRunningWorkflow', 1);
    expect(overLimit.allowed).toBe(false);
  });

  it('never authoritatively blocks a pooled (Enterprise) tier locally — defers to organizationUsageService instead', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    const result = usageEngine.canConsume('autonomousExecution', 1);
    expect(result).toEqual({ allowed: true, pooled: true, deferTo: 'organizationUsageService' });
  });

  it('recordUsage() is a no-op for a pooled tier — never writes to the local per-account counter', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    const before = usageStore.getUsage('desktopAutomation').usedThisPeriod;
    usageEngine.recordUsage('desktopAutomation', 5);
    expect(usageStore.getUsage('desktopAutomation').usedThisPeriod).toBe(before);
  });

  it('getUnifiedUsageSummary() includes all 8 capabilities, with aiReasoning sourced from the rolling window (not a duplicate counter)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const summary = usageEngine.getUnifiedUsageSummary();
    expect(summary).toHaveLength(8);
    expect(summary.map((s) => s.capability)).toContain('aiReasoning');
    const aiReasoning = summary.find((s) => s.capability === 'aiReasoning');
    expect(aiReasoning?.pooled).toBe(false);
    // periodResetsAt must be null — rolling windows have no fixed reset boundary
    expect(aiReasoning?.periodResetsAt).toBeNull();
    // limit5h (the 5h window limit) is the limit exposed for aiReasoning
    expect(aiReasoning?.limit).toBeGreaterThan(0);
  });
});
