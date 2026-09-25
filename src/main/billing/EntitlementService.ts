import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import { rollingUsageGate } from './RollingUsageGate';
import { customerPurchaseUsdToPurchasedPc } from '../../shared/billing/CustomerPcCommercialModel';
import { testTierOverrideStore } from './TestTierOverrideStore';
import { usageEventStore } from './UsageEventStore';
import { buildAccessStore } from './BuildAccessStore';
import type {
  EffectiveTierId,
  EntitlementSnapshot,
  FeatureId,
  RuntimeEntitlementId,
  SeatTier,
  SubscriptionTierId,
  TierEntitlements,
} from '../../shared/billing/BillingTypes';
import type { GenerationCheckResult } from '../../shared/billing/UsageEngineTypes';
import { SUBSCRIPTION_TIER_ORDER } from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS } from '../../shared/billing/RuntimeCatalog';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

const GO_FEATURES: FeatureId[] = [
  'desktopCompanion',
  'basicWorkspace',
  'basicFileManagement',
  'localRuntimeFeatures',
  'connectGithub',
  'advancedRuntimes',
];

const AI_MODELS: PawModelId[] = [
  'paw-flash',
  'paw-swift',
  'paw-core',
  'paw-fable',
  'paw-vision',
  'paw-voice',
  'paw-memory',
];

/**
 * The Think-vs-Execute boundary (Paw Go = Think only, Pro+ = Think + Execute) — the actual
 * enforcement point is DesktopExecutionEngine.execute(), which refuses every
 * CODING_EXECUTION_ACTION_TYPES/INFRA_EXECUTION_ACTION_TYPES request unless this feature is
 * available, clamping CodingModeStore/InfraModeStore's local safety toggles by the real tier
 * rather than leaving them as free, billing-independent switches.
 *
 * Mobile Presence follows the same Go-vs-Pro boundary: Paw Go gets none of
 * mobilePairing/crossDeviceSync/mobileNotifications (no phone pairing, no
 * connected devices, no cross-device sync at all). Pro unlocks the full
 * personal Mobile Presence experience; Pro Max is identical for Mobile
 * Presence specifically (differs only in usage capacity, never in feature
 * availability there) — but Pro Max does add real feature gaps beyond Pro
 * for connectors/ticket billing, see PRO_MAX_FEATURES below.
 *
 * Connector gating (explicitly instructed): every connector is Pro-and-above only, never
 * available on Go. GitHub/GitLab/Vercel/Netlify/Railway (source-control/hosting connectors) and
 * Google Workspace/Slack (personal productivity connectors) all sit on the Pro baseline. Jira and
 * Linear are deliberately held back to Pro Max (see PRO_MAX_FEATURES) since they're real
 * ticket-writing connectors paired with the Autonomous Ticket Balance feature, not general-purpose
 * connectors.
 */
const PRO_FEATURES: FeatureId[] = [
  ...GO_FEATURES,
  'companionStudio',
  'advancedRuntimes',
  'mobilePairing',
  'crossDeviceSync',
  'mobileNotifications',
  'connectGoogleWorkspace',
  'connectSlack',
  'connectMicrosoft',
  'connectGithub',
  'connectGitlab',
  'connectVercel',
  'connectNetlify',
  'connectRailway',
  'meetingAssistant', // Meeting recording, summarization, and distribution
];

/**
 * No longer identical to PRO_FEATURES (explicitly instructed correction): Pro Max additionally
 * unlocks connectJira/connectLinear and autonomousTaskBilling (Ticket Balance) — Jira/Linear are
 * the connectors that actually write tickets back, so they're gated together with the Ticket
 * Balance wallet that pays for autonomous work resolving those tickets, rather than split across
 * two different tiers. Every other feature/model stays identical to Pro; only usage capacity
 * (UsageQuotaConfigStore) differs beyond this.
 *
 * autonomousPlanBypass: the explicit, checked policy decision (per the audit finding that the live
 * autonomous tool loop auto-confirmed applyCodeEdit/writeFile unconditionally, with no entitlement
 * check anywhere in that path) that Pro Max/Team/Enterprise autonomous runs are allowed to execute
 * code edits without pausing for interactive plan approval — see
 * AutonomousOrchestrator.ts's HeadlessTurnRunner.run(), the only consumer. Absent this feature, a
 * run falls back to 'manual' execution mode, which routes every applyCodeEdit/writeFile through the
 * real waiting_for_permission/ALLOW-DENY flow instead of auto-confirming it. This is deliberately
 * grouped with autonomousTaskBilling (the same tier that can bill for autonomous work is the same
 * tier authorized to run it unattended) rather than a new, separate tier boundary.
 */
const PRO_MAX_FEATURES: FeatureId[] = [
  ...PRO_FEATURES,
  'connectLinear',
  'connectJira',
  'autonomousTaskBilling',
  'autonomousPlanBypass',
];

/**
 * Every real organization-scoped runtime capability shipped so far
 * (Phases P1-P6): shared workspaces/companions/credits, admin controls,
 * task management, Git collaboration (AI PR review), Remote Assistance,
 * CRM projection, and Governance & Security (credential vault, approval
 * queue, audit log, SSO). GovernanceGate.ts and OrganizationSection.tsx
 * both apply these to ANY organization tier — Team or Enterprise — so they
 * belong on the Team baseline, not gated as Enterprise-exclusive.
 * connectLinear/connectJira/autonomousTaskBilling are no longer listed here
 * directly — they're inherited from PRO_MAX_FEATURES (see above), since
 * Team is a superset of Pro Max.
 *
 * connectGoogleWorkspace is deliberately excluded (explicitly instructed, 2026-08-18): a personal
 * Gmail/Drive/Calendar/Contacts connection is an individual-account capability (Pro/Pro Max), not
 * something an org-wide Team/Enterprise seat should inherit automatically — connecting someone's
 * personal Google account isn't an organization-scoped capability the way Jira/Linear ticket access
 * or Git collaboration are. PRO_MAX_FEATURES still includes it (spread in below), so it has to be
 * filtered back out here rather than simply never added — this is the one place Team/Enterprise's
 * "superset of Pro Max" inheritance is deliberately narrowed rather than only extended.
 */
const TEAM_FEATURES: FeatureId[] = [
  ...PRO_MAX_FEATURES,
  'sharedWorkspaces',
  'organizationMembers',
  'sharedCompanions',
  'sharedCredits',
  'adminControls',
  'teamBilling',
  'creditPool',
  'taskManagement',
  'gitCollaboration',
  'remoteAssistance',
  'crmProjection',
  'governanceCredentialVault',
  'governanceApprovalQueue',
  'governanceAuditLog',
  'ssoConfiguration',
];

/**
 * Enterprise's distinguishing feature beyond Team: organizationCrossDeviceAlerts — Team members
 * get personal Mobile Presence (their own devices/notifications, per-user, not pooled) via
 * TEAM_FEATURES already inheriting PRO_MAX_FEATURES (which itself now includes
 * autonomousTaskBilling), but only Enterprise additionally routes org-wide
 * governance/security/deployment alerts to trusted devices (Cross Device Runtime checks this
 * feature before publishing an organizationAlert/securityAlert/deploymentAlert cross-device event,
 * vs. a personal taskCompleted/approvalRequired event which only needs crossDeviceSync).
 * Enterprise orgs also get richer RBAC roles (organizationOwner/itAdministrator/
 * securityAdministrator/departmentManager vs Team's flatter owner/admin/member — see
 * ENTERPRISE_ROLES in OrganizationSection.tsx), which is a role list, not a FeatureId gate.
 * Enterprise's real billing distinction (metered seat base fee + usage instead of a flat per-seat
 * rate) is a PricingConfigStore concern, not a FeatureId — autonomousTaskBilling (the Ticket
 * Balance wallet itself) is now shared with Pro Max/Team, not Enterprise-exclusive.
 */
const ENTERPRISE_FEATURES: FeatureId[] = [...TEAM_FEATURES, 'organizationCrossDeviceAlerts'];

/**
 * PawOS Build — the private, admin-granted student tier (see BuildAccessStore.ts). Listed explicitly
 * rather than derived from GO_FEATURES so a change to Paw Go never silently changes the student
 * program. Includes coding execution (advancedRuntimes), the student connectors, and the career
 * tools (CareerService.ts). Deliberately excludes: autonomousTaskBilling / autonomousPlanBypass
 * (Autonomous Work and the Autonomous Ticket System), Slack/Jira/Linear, every Team/Enterprise
 * feature, Companion Studio, and mobile pairing/sync.
 */
const BUILD_FEATURES: FeatureId[] = [
  'desktopCompanion',
  'basicWorkspace',
  'basicFileManagement',
  'localRuntimeFeatures',
  'advancedRuntimes',
  'connectGithub',
  'connectVercel',
  'connectGoogleWorkspace',
  'connectMicrosoft',
  'resumeGeneration',
  'resumeRewriting',
  'atsScoring',
  'jobSearch',
];

/** Build gets every included-capacity model. Paw Fable is excluded: it is funded only by purchased
 *  credits, and Build capacity is included-only (see checkGeneration()). */
const BUILD_MODELS: PawModelId[] = ['paw-flash', 'paw-swift', 'paw-core', 'paw-vision', 'paw-voice', 'paw-memory'];

export const LEGACY_PLAN_RUNTIME_ENTITLEMENTS: RuntimeEntitlementId[] = ALL_RUNTIME_ENTITLEMENT_IDS;

/**
 * Explicitly decided (2026-08-18): Coding Runtime is included in Pro and Pro Max, not a separate
 * a-la-carte purchase — a Pro/Pro Max account with advancedRuntimes should never see "This action
 * requires Paw Pro" while already on Paw Pro. Only 'coding' is added here (not every id in
 * RuntimeCatalog.ts's pro/proMax `supportedTiers` list) since it's the only one actually
 * `purchasable`/'available' for those tiers today — the rest (office/browser/communication/
 * companion) are still `deferred`/`implementationStatus !== 'production-capable'`, so granting them
 * would be premature. RuntimeCatalog.ts's `purchasable: true` flag on 'coding' is now a no-op for
 * pro/proMax (nothing left to purchase there) but is left as-is rather than touched here.
 */
export const PLAN_DERIVED_RUNTIME_ENTITLEMENTS: Record<SubscriptionTierId, RuntimeEntitlementId[]> = {
  go: ['coding', 'browser'],
  pro: ['coding', 'browser'],
  proMax: ['coding', 'browser'],
  team: LEGACY_PLAN_RUNTIME_ENTITLEMENTS,
  enterprise: LEGACY_PLAN_RUNTIME_ENTITLEMENTS,
};

/**
 * The single source of truth for what a tier unlocks (models/features only
 * — monthlyCreditLimit is resolved dynamically from UsageQuotaConfigStore's
 * single 'aiReasoning' config in getEntitlements() below, never stored
 * statically here). No runtime should hard-code a tier/feature check of its
 * own — everything goes through EntitlementService below. Paw Go is "Think,
 * not Execute" — real AI model access for investigation/analysis/planning
 * (paw-flash, the cheapest reasoning model), a real but capped credit pool,
 * and every CODING_EXECUTION_ACTION_TYPES/INFRA_EXECUTION_ACTION_TYPES
 * request refused (see DesktopExecutionEngine.execute()'s 'advancedRuntimes'
 * check) — not the previous "zero AI models, zero AI credits" design,
 * which the Intelligence Layer architecture explicitly reversed.
 */
const TIER_ENTITLEMENTS: Record<SubscriptionTierId, Omit<TierEntitlements, 'monthlyCreditLimit' | 
'weeklyCreditLimit' | 'seatTier'>> = {
  go: { tier: 'go', models: ['paw-flash', 'paw-voice'], features: GO_FEATURES },
  pro: { tier: 'pro', models: AI_MODELS, features: PRO_FEATURES },
  proMax: { tier: 'proMax', models: AI_MODELS, features: PRO_MAX_FEATURES },
  team: { tier: 'team', models: AI_MODELS, features: TEAM_FEATURES },
  enterprise: { tier: 'enterprise', models: AI_MODELS, features: ENTERPRISE_FEATURES },
};

/**
 * Runtime -> Entitlement Service -> Current Plan -> Available Features ->
 * Selected Model -> Credits -> Execute. Every runtime that needs to know
 * "can the current user do X" calls this, never SubscriptionStore or a
 * local tier constant directly.
 */
class EntitlementService {
  private userId: string | null = null;

  setCurrentUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * The account's own subscription tier (plus an internal test override, if any) — what Build falls
   * back to when it expires or is revoked. Never 'build'. Used for anything tied to the purchased
   * subscription itself: pricing, upgrades, organization pooling, server tier sync.
   */
  public baseTier(): SubscriptionTierId {
    const realTier = subscriptionStore.getEffective().tier;

    // Check for test tier override (only applies to authorized internal accounts)
    if (this.userId) {
      const effectiveTier = testTierOverrideStore.getEffectiveTier(this.userId, realTier);
      return effectiveTier;
    }

    return realTier;
  }

  /**
   * The tier that governs entitlements and Paw Compute right now: 'build' while a server-confirmed,
   * unexpired PawOS Build grant is loaded (BuildAccessStore.isActive()) and the account has no paid
   * plan of its own, otherwise baseTier(). Every
   * entitlement, capacity and usage decision goes through this — never a separate Build special case.
   */
  public effectiveTier(): EffectiveTierId {
    const base = this.baseTier();
    // A paid plan always wins over Build — e.g. a student who upgrades to Pro in Build's final week
    // gets Pro immediately rather than waiting out the grant.
    return base === 'go' && buildAccessStore.isActive() ? 'build' : base;
  }

  /** Only meaningful for 'team' — which seat rate (Standard/Premium) this account was assigned. */
  getSeatTier(): SeatTier | undefined {
    if (this.effectiveTier() !== 'team') return undefined;
    return subscriptionStore.getEffective().seatTier;
  }

  /**
   * Standard and Premium seats currently unlock the identical Team feature
   * set and model list — Pro and Pro Max already carry the same relationship
   * (both PRO_FEATURES) in this codebase, so this isn't a new gap; their
   * Paw Compute *limits* do differ (see UsageQuotaConfigStore — Pro Max is
   * 20x Pro, Team Premium is larger than Team Standard), which is the
   * correct, intentional differentiation point, not a feature gap.
   * seatTier is echoed on the result for billing/UI display
   * and as the wiring point for a future real Standard/Premium capability
   * split, not fabricated as a difference that doesn't exist yet. The same
   * discipline applies to Pro vs Pro Max for Mobile Presence: identical
   * feature sets, the only real difference is usage capacity (see the
   * Usage & Entitlement Engine, MOB-3), never a feature gap.
   */
  public currentProMaxVariant(): '5x' | '20x' | undefined {
    if (this.effectiveTier() !== 'proMax') return undefined;
    return subscriptionStore.getEffective().proMaxVariant as '5x' | '20x' | undefined;
  }

  getEntitlements(): TierEntitlements {
    const tier = this.effectiveTier();
    if (tier === 'build') {
      return { tier: 'build', models: [...BUILD_MODELS], features: [...BUILD_FEATURES], monthlyCreditLimit: null, weeklyCreditLimit: null };
    }

    const base = TIER_ENTITLEMENTS[tier];
    const seatTier = this.getSeatTier();
    // Monthly and weekly flat-credit limits are superseded by rolling windows (PawComputeCapacityStore).
    // These fields remain on TierEntitlements for backward compat but are always null now.
    const monthlyCreditLimit: number | null = null;
    const weeklyCreditLimit: number | null = null;
    return seatTier ? { ...base, monthlyCreditLimit, weeklyCreditLimit, seatTier } : { ...base, monthlyCreditLimit, weeklyCreditLimit };
  }

  isModelAvailable(modelId: PawModelId): boolean {
    if (modelId === 'paw-fable' && this.effectiveTier() !== 'build' && this.getPurchasedCreditsRemaining() > 0) {
      return true;
    }
    return this.getEntitlements().models.includes(modelId);
  }

  /**
   * For every known Paw model, the minimum tier whose TIER_ENTITLEMENTS.models list actually
   * includes it — derived directly from the same table isModelAvailable()/getEntitlements() already
   * read, never a second hardcoded gating rule. Static, account-independent config (doesn't depend
   * on the current user), so it's exposed as its own read rather than folded into the personal
   * EntitlementSnapshot. Used by the composer's model picker to render "requires <tier>" instead of
   * a generic "locked" label — see entitlement:getModelTierRequirements.
   */
  getModelTierRequirements(): Partial<Record<PawModelId, SubscriptionTierId>> {
    const result: Partial<Record<PawModelId, SubscriptionTierId>> = {};
    for (const modelId of AI_MODELS) {
      for (const tier of SUBSCRIPTION_TIER_ORDER) {
        if (TIER_ENTITLEMENTS[tier].models.includes(modelId)) {
          result[modelId] = tier;
          break;
        }
      }
    }
    return result;
  }

  isFeatureAvailable(featureId: FeatureId): boolean {
    return this.getEntitlements().features.includes(featureId);
  }

  /**
   * For every FeatureId that appears in any tier's feature list, the minimum tier that actually
   * unlocks it — derived directly from TIER_ENTITLEMENTS (the same table isFeatureAvailable()
   * already reads), never a second hand-maintained tier-name map. This is the single source of
   * truth for "which plan do I need for X" — any UI wanting to tell a user which tier a capability
   * requires (an upgrade CTA, a locked connector card, a blocked-action message) must call this or
   * findMinimumTierForFeature() rather than hardcoding a tier name, so the recommendation can never
   * drift out of sync with the real entitlement table. Static, account-independent config, so it's
   * exposed as its own read rather than folded into the personal EntitlementSnapshot — see
   * entitlement:getFeatureTierRequirements.
   */
  getFeatureTierRequirements(): Partial<Record<FeatureId, SubscriptionTierId>> {
    const result: Partial<Record<FeatureId, SubscriptionTierId>> = {};
    for (const tier of SUBSCRIPTION_TIER_ORDER) {
      for (const featureId of TIER_ENTITLEMENTS[tier].features) {
        if (!(featureId in result)) result[featureId] = tier;
      }
    }
    return result;
  }

  /** Convenience single-feature lookup over getFeatureTierRequirements() — the real, current tier
   *  a specific capability requires, or null if no tier grants it (shouldn't happen for a real
   *  FeatureId, but never assumed). */
  findMinimumTierForFeature(featureId: FeatureId): SubscriptionTierId | null {
    return this.getFeatureTierRequirements()[featureId] ?? null;
  }

  getRuntimeEntitlements(): RuntimeEntitlementId[] {
    const tier = this.effectiveTier();
    const baseIds: RuntimeEntitlementId[] = tier === 'build' ? ['coding', 'browser'] : PLAN_DERIVED_RUNTIME_ENTITLEMENTS[tier];
    const ids = new Set<RuntimeEntitlementId>(baseIds);
    for (const grant of subscriptionStore.getPurchasedRuntimeEntitlements()) {
      ids.add(grant.runtimeId);
    }
    return [...ids];
  }

  isRuntimeEntitled(runtimeId: RuntimeEntitlementId): boolean {
    return this.getRuntimeEntitlements().includes(runtimeId);
  }

  diffRuntimeEntitlements(requested: RuntimeEntitlementId[]): RuntimeEntitlementId[] {
    const owned = new Set(this.getRuntimeEntitlements());
    return requested.filter((runtimeId, index) => requested.indexOf(runtimeId) === index && !owned.has(runtimeId));
  }

  getCreditLimit(): number | null {
    return this.getEntitlements().monthlyCreditLimit;
  }

  /** null = no weekly cap configured for this tier (today: every tier except pro/proMax) — see hasCreditsRemaining(), which enforces this alongside the monthly limit, whichever binds first. */
  getWeeklyCreditLimit(): number | null {
    return this.getEntitlements().weeklyCreditLimit;
  }

  /**
   * True only for Enterprise — Paw Compute for this tier is pooled
   * organization-wide and enforced server-side by
   * increment_organization_usage(), never by this local credit balance.
   * Callers that gate a new AI request must branch on this and, when true,
   * call organizationUsageService.recordUsage(orgId, 'aiReasoning', 1) from
   * the renderer instead of relying on hasCreditsRemaining() — mirroring
   * exactly how UsageEngine.canConsume() already requires pooled callers to
   * behave for the other 7 tracked capabilities.
   */
  isComputePooled(): boolean {
    const tier = this.effectiveTier();
    return tier !== 'build' && usageQuotaConfigStore.isPooled(tier);
  }

  /**
   * Non-AI desktop functionality never consumes credits and is never gated by this. Always true
   * for a pooled tier at this layer — see isComputePooled(). Factors in any bonus Paw Compute
   * redeemed this period (see CreditStore.grantBonus()) on top of the tier's own configured
   * limit. Checks the weekly cap (when one is configured for this tier) alongside the monthly
   * one — whichever binds first blocks further usage; the bonus applies to both caps equally,
   * since it's genuinely extra headroom, not scoped to one cadence.
   *
   * Paw Fable is a structurally different check, not an extra condition layered on the above: it
   * never touches the tier's monthly/weekly allowance in either direction, so a Fable request is
   * gated purely on real purchased-credit headroom (bonusThisPeriod minus what Fable has already
   * spent this period) — see getFableCreditsRemaining(). A tier with plenty of included allowance
   * left must still be blocked here if that purchased-credit headroom is exhausted.
   */
  getPurchasedCreditsRemaining(): number {
    const balance = creditStore.getBalance();
    return Math.max(0, customerPurchaseUsdToPurchasedPc(balance.purchasedUsageCreditsUsd));
  }

  getFableCreditsRemaining(): number {
    return this.getPurchasedCreditsRemaining();
  }

  getStandardBonusCreditsRemaining(): number {
    return this.getPurchasedCreditsRemaining();
  }

  /**
   * Whether purchased Paw Compute may carry the account past exhausted included capacity (turns and
   * counted file changes alike). Needs a purchased balance; on PawOS Build it works in every week
   * except the final one (no reset left — the way on is upgrading to Pro).
   */
  canContinueOnPurchasedCompute(now = Date.now()): boolean {
    if (this.getStandardBonusCreditsRemaining() <= 0) return false;
    return !rollingUsageGate.isBuildFinalWeek(this.effectiveTier(), now);
  }

  /** True during PawOS Build's final (no-reset) week. */
  isBuildFinalWeek(now = Date.now()): boolean {
    return rollingUsageGate.isBuildFinalWeek(this.effectiveTier(), now);
  }

  grantComputeBonus(_units: number): void {
    // Rolling-window Paw Compute no longer uses local bonus counters. The
    // handler is kept as a compatibility no-op for older renderer surfaces.
  }

  /**
   * The single generation-admission decision used by the real chat/voice gate
   * (billing:canStartGeneration), turn recording, the career tools and the snapshot. Rules:
   *  - Pooled tiers (Enterprise/Team) defer to the organization pool (server-side).
   *  - Paw Fable is gated purely on purchased-credit headroom — and is not part of PawOS Build.
   *  - Otherwise the effective tier's four rolling limits apply (RollingUsageGate).
   *  - Purchased Compute Credits may continue past exhausted included capacity
   *    (canContinueOnPurchasedCompute). On PawOS Build that holds in every week except the final one
   *    (no reset left before access ends) — there the only way on is upgrading to Pro.
   */
  checkGeneration(pawModelId?: PawModelId, now = Date.now()): GenerationCheckResult & { purchasedContinuation: boolean } {
    const tier = this.effectiveTier();
    const seatTier = this.getSeatTier();
    const proMaxVariant = this.currentProMaxVariant();
    const usage = rollingUsageGate.getRollingUsage(tier, seatTier, now, proMaxVariant);

    if (pawModelId === 'paw-fable') {
      if (tier === 'build') {
        return { allowed: false, pooled: false, reason: 'Paw Fable is not included in PawOS Build.', usage, purchasedContinuation: false };
      }
      if (this.getFableCreditsRemaining() > 0) return { allowed: true, pooled: false, usage, purchasedContinuation: false };
      return { allowed: false, pooled: false, reason: 'Paw Fable credits exhausted', usage, purchasedContinuation: false };
    }

    const result = rollingUsageGate.canStartGeneration(tier, seatTier, now, proMaxVariant);
    if (result.allowed || result.pooled) return { ...result, purchasedContinuation: false };
    if (result.reason === 'inflight') return { ...result, purchasedContinuation: false };
    if (this.canContinueOnPurchasedCompute(now)) {
      return { allowed: true, pooled: false, usage: result.usage, purchasedContinuation: true };
    }
    return { ...result, purchasedContinuation: false };
  }

  hasCreditsRemaining(pawModelId?: PawModelId): boolean {
    if (this.isComputePooled()) return true;
    const check = this.checkGeneration(pawModelId);
    // A reply currently being generated holds the in-flight slot — that's "busy", not "out of compute".
    return check.allowed || check.reason === 'inflight';
  }

  getSnapshot(): EntitlementSnapshot {
    const entitlements = this.getEntitlements();
    const balance = creditStore.getBalance();
    const tier = this.effectiveTier();
    const seatTier = this.getSeatTier();
    const rolling = rollingUsageGate.getRollingUsage(tier, seatTier, Date.now(), this.currentProMaxVariant());
    return {
      tier,
      baseTier: this.baseTier(),
      buildAccess: buildAccessStore.get(),
      models: entitlements.models,
      features: entitlements.features,
      runtimeEntitlements: this.getRuntimeEntitlements(),
      creditLimit: null,                        // superseded by rolling windows
      creditsUsedThisPeriod: balance.usedThisPeriod,
      
      hasCreditsRemaining: this.hasCreditsRemaining(),
      pooled: this.isComputePooled(),
      seatTier: entitlements.seatTier,
      weeklyCreditLimit: null,                  // superseded by rolling windows
      creditsUsedThisWeek: balance.usedThisWeek,
      weekResetsAt: balance.weekResetsAt,
      purchasedPcRemaining: this.isComputePooled() ? 0 : this.getPurchasedCreditsRemaining(),
      usage5hPc: rolling.usage5h,
      limit5hPc: rolling.limit5h,
      usageWeeklyPc: rolling.usage7d,
      limitWeeklyPc: rolling.limit7d,
      usageMonthlyPc: rolling.usage7d, // Use 7d as monthly proxy
      limitMonthlyPc: rolling.limit7d, // Use 7d limit as monthly proxy
      activeHoursWeekly: rolling.activeHours7d,
      activeHours5h: rolling.activeHours5h,
      activeHoursUsed7d: rolling.activeHoursUsed7d,
      activeHoursUsed5h: rolling.activeHoursUsed5h,
      usageWindowResetsAt: rolling.windowResetsAt,
      usageWeekResetsAt: rolling.weekResetsAt,
      buildFinalWeek: this.isBuildFinalWeek(),
      proMaxVariant: this.currentProMaxVariant(),
      goRefreshesRemaining: usageEventStore.getGoRefreshesRemaining(),
    };
  }
}

export const entitlementService = new EntitlementService();
