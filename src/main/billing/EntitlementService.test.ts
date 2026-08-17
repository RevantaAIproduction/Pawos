import { afterEach, describe, expect, it, vi } from 'vitest';
import { entitlementService } from './EntitlementService';
import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
import type { RuntimeEntitlementGrant } from '../../shared/billing/BillingTypes';

describe('EntitlementService — Go tier Think-not-Execute redesign', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives Go real model access (paw-flash) instead of zero models', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.getEntitlements().models).toContain('paw-flash');
    expect(entitlementService.isModelAvailable('paw-flash')).toBe(true);
  });

  it('caps Go credits at a real positive number — not 0 (no AI) and not null (unlimited)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    const limit = entitlementService.getCreditLimit();
    expect(limit).not.toBeNull();
    expect(limit).toBeGreaterThan(0);
    expect(limit).toBe(20);
  });

  it('does not grant advancedRuntimes (the Execute-class entitlement) to Go', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(false);
    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
  });

  it('Paw Credits can extend compute headroom but never unlock Go execution entitlements', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({
      limit: null,
      usedThisPeriod: 20,
      bonusThisPeriod: 5,
      periodResetsAt: Date.now() + 1000,
    });

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(false);
    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
  });

  it('still reports hasCreditsRemaining() true when nothing has been consumed yet', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('is never reported as a pooled tier', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });

    expect(entitlementService.isComputePooled()).toBe(false);
  });
});

describe('EntitlementService — Paw Compute usage-limit enforcement (paid tiers)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Pro has a real, finite, positive monthly Paw Compute limit — not unlimited', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });

    const limit = entitlementService.getCreditLimit();
    expect(limit).not.toBeNull();
    expect(limit).toBeGreaterThan(0);
  });

  it('Pro Max derives its limit as exactly 20x Pro, never a second hardcoded number', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'pro', status: 'active' });
    const proLimit = entitlementService.getCreditLimit();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'proMax', status: 'active' });
    const proMaxLimit = entitlementService.getCreditLimit();

    expect(proLimit).not.toBeNull();
    expect(proMaxLimit).toBe((proLimit as number) * 20);
  });

  it('Team Standard and Team Premium seats have different, real, per-seat monthly limits', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'standard' });
    const standardLimit = entitlementService.getCreditLimit();

    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'team', status: 'active', seatTier: 'premium' });
    const premiumLimit = entitlementService.getCreditLimit();

    expect(standardLimit).not.toBeNull();
    expect(premiumLimit).not.toBeNull();
    expect(premiumLimit as number).toBeGreaterThan(standardLimit as number);
  });

  it('Enterprise is reported as pooled, and hasCreditsRemaining() stays true locally regardless of local CreditStore usage (the real check is server-side)', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });

    expect(entitlementService.isComputePooled()).toBe(true);
    expect(entitlementService.hasCreditsRemaining()).toBe(true);
  });

  it('getSnapshot() reports pooled: false for every non-Enterprise paid tier', () => {
    for (const tier of ['pro', 'proMax', 'team'] as const) {
      vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
      expect(entitlementService.getSnapshot().pooled).toBe(false);
    }
  });

  it('getSnapshot() reports pooled: true for Enterprise', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'enterprise', status: 'active' });
    expect(entitlementService.getSnapshot().pooled).toBe(true);
  });

  it.each(['pro', 'proMax', 'team', 'enterprise'] as const)('%s tier still grants advancedRuntimes', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });

    expect(entitlementService.isFeatureAvailable('advancedRuntimes')).toBe(true);
  });
});

describe('EntitlementService — runtime entitlement foundation', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['pro', 'proMax'] as const)('new %s accounts do not automatically receive every runtime entitlement', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(false);
    expect(entitlementService.getSnapshot().runtimeEntitlements).toEqual([]);
  });

  it.each(['team', 'enterprise'] as const)('%s keeps the existing organization runtime entitlement behavior for this phase', (tier) => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier, status: 'active' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);

    expect(entitlementService.isRuntimeEntitled('coding')).toBe(true);
    expect(entitlementService.getSnapshot().runtimeEntitlements).toContain('communication');
  });

  it('keeps UsageEngine and Paw Credits separate from runtime entitlement', () => {
    vi.spyOn(subscriptionStore, 'get').mockReturnValue({ tier: 'go', status: 'none' });
    vi.spyOn(subscriptionStore, 'getPurchasedRuntimeEntitlements').mockReturnValue([]);
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({
      limit: null,
      usedThisPeriod: 20,
      bonusThisPeriod: 100,
      periodResetsAt: Date.now() + 1000,
    });

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
    vi.spyOn(creditStore, 'getBalance').mockReturnValue({
      limit: null,
      usedThisPeriod: 2000,
      bonusThisPeriod: 100,
      periodResetsAt: Date.now() + 1000,
    });

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
    expect(requirements['paw-creative']).toBe('pro');
    expect(requirements['paw-vision']).toBe('pro');
    expect(requirements['paw-voice']).toBe('pro');
    expect(requirements['paw-motion']).toBe('pro');
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
