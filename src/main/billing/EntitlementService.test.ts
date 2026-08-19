import { afterEach, describe, expect, it, vi } from 'vitest';
import { entitlementService } from './EntitlementService';
import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
import { usageEventStore } from './UsageEventStore';
import { pawComputeCapacityStore } from './PawComputeCapacityStore';
import type { RuntimeEntitlementGrant } from '../../shared/billing/BillingTypes';

describe('EntitlementService — Go tier Think-not-Execute redesign', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives Go real model access (paw-flash) instead of zero models', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.getEntitlements().models).toContain('paw-flash');
    expect(entitlementService.isModelAvailable('paw-flash')).toBe(true);
  });

  it('getCreditLimit() returns null for all tiers — monthly flat-credit limits replaced by rolling windows', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    expect(entitlementService.getCreditLimit()).toBeNull();
  });

  it('Go has a finite rolling 5-hour Paw Compute capacity (not null/unlimited)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const snap = entitlementService.getSnapshot();
    expect(snap.limit5hPc).not.toBeNull();
    expect(snap.limit5hPc as number).toBeGreaterThan(0);
  });

  it('does not grant advancedRuntimes (the Execute-class entitlement) to Go', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(false);
    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
  });

  it('bonus Paw Credits extend Fable headroom but never unlock Go execution entitlements', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({
      limit: null,
      usedThisPeriod: 20,
      bonusThisPeriod: 5,
      periodResetsAt: Date.now() + 1000,
      usedThisWeek: 0,
      weekResetsAt: Date.now() + 1000,
      fableUsedThisPeriod: 0,
    });

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(false);
    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
  });

  it('still reports hasCreditsRemaining() true when nothing has been consumed yet (rolling window empty)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('is never reported as a pooled tier', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isComputePooled()).toBe(false);
  });
});

describe('EntitlementService — Paw Compute usage-limit enforcement (paid tiers)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('getCreditLimit() always returns null — rolling windows replace monthly flat-credit limits', () => {
    for (const tier of ['go', 'pro', 'proMax', 'team', 'enterprise'] as const) {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
      expect(entitlementService.getCreditLimit()).toBeNull();
    }
  });

  it('Pro has a real, finite, positive 5-hour rolling window limit — not null/unlimited', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    const snap = entitlementService.getSnapshot();
    expect(snap.limit5hPc).not.toBeNull();
    expect(snap.limit5hPc as number).toBeGreaterThan(0);
  });

  it('Pro Max 5h limit is larger than Pro — different rolling window capacity, not 20x monthly', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const proSnap = entitlementService.getSnapshot();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    const proMaxSnap = entitlementService.getSnapshot();

    expect((proMaxSnap.limit5hPc as number)).toBeGreaterThan((proSnap.limit5hPc as number));
  });

  it('Team Premium seats have a larger 5h rolling window than Team Standard', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });
    const standardSnap = entitlementService.getSnapshot();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'premium' });
    const premiumSnap = entitlementService.getSnapshot();

    expect((premiumSnap.limit5hPc as number)).toBeGreaterThan((standardSnap.limit5hPc as number));
  });

  it('hasCreditsRemaining() is false when 5h usage equals the limit (rolling window exhausted)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const capacity = pawComputeCapacityStore.resolve('pro');
    const limit5h = capacity.window5hPc as number;
    const now = Date.now();
    // Fill the 5h window exactly to the limit with non-fable records inside the window
    vi.spyOn(usageEventStore, 'list').mockReturnValue([
      { usageEventId: 'e1', requestId: 'r1', timestamp: now - 1000, normalizedCompute: limit5h, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: null, thoughtsTokens: null, requestType: 'conversationTurn', sessionId: null, runId: null, provider: 'gemini', model: 'gemini-2.0-flash' },
    ]);
    expect(entitlementService.hasCreditsRemaining()).toBe(false);
  });

  it('Enterprise is reported as pooled, and hasCreditsRemaining() stays true locally regardless of local CreditStore usage (the real check is server-side)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });

    expect(entitlementService.isComputePooled()).toBe(true);
    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('getSnapshot() reports pooled: false for every non-Enterprise paid tier', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    for (const tier of ['pro', 'proMax', 'team'] as const) {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
      expect(entitlementService.getSnapshot().pooled).toBe(false);
    }
  });

  it('getSnapshot() reports pooled: true for Enterprise', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    expect(entitlementService.getSnapshot().pooled).toBe(true);
  });

  it('getSnapshot() reports creditLimit and weeklyCreditLimit as null — deprecated, rolling windows are now the enforcement system', () => {
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const snap = entitlementService.getSnapshot();
    expect(snap.creditLimit).toBeNull();
    expect(snap.weeklyCreditLimit).toBeNull();
  });

  it.each(['pro', 'proMax', 'team', 'enterprise'] as const)('%s tier still grants advancedRuntimes', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(true);
  });
});

describe('EntitlementService — runtime entitlement foundation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['pro', 'proMax'] as const)('new %s accounts get the Coding Runtime plan-derived, but no other runtime entitlement, with no separate purchase', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(true);
    expect(entitlementService.isRuntimeEntitled('office')).toBe(false);
    expect(entitlementService.getSnapshot().runtimeEntitlements).toEqual(['coding']);
  });

  it.each(['team', 'enterprise'] as const)('%s keeps the existing organization runtime entitlement behavior for this phase', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(true);
    expect(entitlementService.getSnapshot().runtimeEntitlements).toContain('communication');
  });

  it('keeps rolling-window Paw Compute and Paw Credits separate from runtime entitlement', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
  });

  it('preserves an existing purchased runtime when another runtime is added to the account grant set', () => {
    const grants: RuntimeEntitlementGrant[] = [
      { runtimeId: 'coding', source: 'purchase', grantedAt: 1 },
      { runtimeId: 'office', source: 'purchase', grantedAt: 2 },
    ];
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none', runtimeEntitlements: grants });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue(grants);

    expect(entitlementService.getRuntimeEntitlements()).toEqual(['coding', 'office']);
  });

  it('grants Coding when it is explicitly purchased', () => {
    const grants: RuntimeEntitlementGrant[] = [{ runtimeId: 'coding', source: 'purchase', grantedAt: 1, orderId: 'order-1' }];
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active', runtimeEntitlements: grants });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue(grants);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(true);
    expect(entitlementService.isRuntimeEntitled('office')).toBe(false);
  });

  it('preserves grandfathered paid-plan grants without treating Paw Credits as runtime access', () => {
    const grants: RuntimeEntitlementGrant[] = [{ runtimeId: 'coding', source: 'plan', grantedAt: 1, orderId: 'legacy-plan-grandfather' }];
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({
      tier: 'pro',
      status: 'active',
      runtimeEntitlements: grants,
      runtimeEntitlementPolicyVersion: 1,
      runtimeEntitlementsGrandfatheredAt: 1,
    });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue(grants);
    vi.spyOn(usageEventStore, 'list').mockReturnValue([]);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(true);
    expect(entitlementService.isRuntimeEntitled('office')).toBe(false);
  });

  it('represents only newly requested runtimes as payable when some are already owned', () => {
    const grants: RuntimeEntitlementGrant[] = [{ runtimeId: 'coding', source: 'purchase', grantedAt: 1 }];
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none', runtimeEntitlements: grants });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue(grants);

    expect(entitlementService.diffRuntimeEntitlements(['coding', 'office', 'browser', 'office'])).toEqual(['office', 'browser']);
  });
});

describe('EntitlementService — getModelTierRequirements (model picker)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps every model to the lowest tier whose TIER_ENTITLEMENTS.models actually includes it', () => {
    const requirements = entitlementService.getModelTierRequirements();
    // Go's own real model list (see 'gives Go real model access' above) means paw-flash requires
    // only Go — never a paid tier — while every other model requires at least Pro, per
    // PRO_FEATURES/AI_MODELS in EntitlementService.ts.
    expect(requirements['paw-flash']).toBe('go');
    expect(requirements['paw-swift']).toBe('pro');
    expect(requirements['paw-core']).toBe('pro');
    expect(requirements['paw-fable']).toBe('pro');
    expect(requirements['paw-vision']).toBe('pro');
    expect(requirements['paw-voice']).toBe('pro');
    expect(requirements['paw-memory']).toBe('pro');
  });

  it('is static/account-independent — unaffected by the current subscription tier', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    const asEnterprise = entitlementService.getModelTierRequirements();
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    const asGo = entitlementService.getModelTierRequirements();
    expect(asEnterprise).toEqual(asGo);
  });
});

describe('EntitlementService — final entitlement matrix (connectors, Autonomous Work, Ticket Balance)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Go: Jira/Linear/GitHub/Autonomous Work/Ticket Balance all blocked', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    expect(entitlementService.isFeatureAvailable('connectJira')).toBe(false);
    expect(entitlementService.isFeatureAvailable('connectLinear')).toBe(false);
    expect(entitlementService.isFeatureAvailable('connectGithub')).toBe(false);
    // Autonomous Work and Ticket Balance are both gated by the single 'autonomousTaskBilling'
    // feature (see AutonomousTaskBillingGate.ts's startAutonomousEngineeringTask check and
    // ipc.ts's billing:createCreditsCheckoutSession handler) — there is no second, separate flag.
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(false);
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(false);
  });

  it('Pro: GitHub/GitLab/Vercel/Netlify/Railway/Slack/Google Workspace allowed; Jira/Linear/Autonomous Work/Ticket Balance blocked', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    expect(entitlementService.isFeatureAvailable('connectGithub')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectGitlab')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectVercel')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectNetlify')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectRailway')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectSlack')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectGoogleWorkspace')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectJira')).toBe(false);
    expect(entitlementService.isFeatureAvailable('connectLinear')).toBe(false);
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(false);
    // Pro cannot start Autonomous Work at all (autonomousTaskBilling is false), so
    // autonomousPlanBypass must be blocked too — a plan-approval bypass with no autonomous
    // billing capability behind it would be a meaningless, dangling entitlement.
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(false);
    // The Think-vs-Execute wall (normal coding/infra execution — "NORMAL PAW COMPUTE") is a
    // genuinely different entitlement from Autonomous Work and must stay available to Pro;
    // conflating the two would incorrectly block Pro's existing coding runtime.
    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(true);
  });

  it('Pro Max: Jira/Linear/Autonomous Work/Ticket Balance/Plan Bypass all allowed', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    expect(entitlementService.isFeatureAvailable('connectJira')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectLinear')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(true);
  });

  it('Team: Jira/Linear/Autonomous Work/Ticket Balance/Plan Bypass all allowed', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });
    expect(entitlementService.isFeatureAvailable('connectJira')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectLinear')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(true);
  });

  it('Enterprise: Jira/Linear/Autonomous Work/Ticket Balance/Plan Bypass all allowed', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    expect(entitlementService.isFeatureAvailable('connectJira')).toBe(true);
    expect(entitlementService.isFeatureAvailable('connectLinear')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousTaskBilling')).toBe(true);
    expect(entitlementService.isFeatureAvailable('autonomousPlanBypass')).toBe(true);
  });
});
