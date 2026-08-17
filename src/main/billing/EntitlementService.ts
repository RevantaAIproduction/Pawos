import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import type {
  EntitlementSnapshot,
  FeatureId,
  RuntimeEntitlementId,
  SeatTier,
  SubscriptionTierId,
  TierEntitlements,
} from '../../shared/billing/BillingTypes';
import { SUBSCRIPTION_TIER_ORDER } from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS } from '../../shared/billing/RuntimeCatalog';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

const GO_FEATURES: FeatureId[] = [
  'desktopCompanion',
  'basicWorkspace',
  'basicFileManagement',
  'localRuntimeFeatures',
];

const AI_MODELS: PawModelId[] = [
  'paw-flash',
  'paw-swift',
  'paw-core',
  'paw-creative',
  'paw-vision',
  'paw-voice',
  'paw-motion',
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
  'connectGithub',
  'connectGitlab',
  'connectVercel',
  'connectNetlify',
  'connectRailway',
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

export const LEGACY_PLAN_RUNTIME_ENTITLEMENTS: RuntimeEntitlementId[] = ALL_RUNTIME_ENTITLEMENT_IDS;

export const PLAN_DERIVED_RUNTIME_ENTITLEMENTS: Record<SubscriptionTierId, RuntimeEntitlementId[]> = {
  go: [],
  pro: [],
  proMax: [],
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
const TIER_ENTITLEMENTS: Record<SubscriptionTierId, Omit<TierEntitlements, 'monthlyCreditLimit' | 'seatTier'>> = {
  go: { tier: 'go', models: ['paw-flash'], features: GO_FEATURES },
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
  private currentTier(): SubscriptionTierId {
    return subscriptionStore.getEffective().tier;
  }

  /** Only meaningful for 'team' — which seat rate (Standard/Premium) this account was assigned. */
  getSeatTier(): SeatTier | undefined {
    const effective = subscriptionStore.getEffective();
    return effective.tier === 'team' ? effective.seatTier : undefined;
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
  getEntitlements(): TierEntitlements {
    const tier = this.currentTier();
    const base = TIER_ENTITLEMENTS[tier];
    const seatTier = this.getSeatTier();
    const monthlyCreditLimit = usageQuotaConfigStore.getEffectiveQuota(tier, seatTier, 'aiReasoning');
    return seatTier ? { ...base, monthlyCreditLimit, seatTier } : { ...base, monthlyCreditLimit };
  }

  isModelAvailable(modelId: PawModelId): boolean {
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
    const tier = this.currentTier();
    const ids = new Set<RuntimeEntitlementId>(PLAN_DERIVED_RUNTIME_ENTITLEMENTS[tier]);
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
    return usageQuotaConfigStore.isPooled(this.currentTier());
  }

  /** Non-AI desktop functionality never consumes credits and is never gated by this. Always true for a pooled tier at this layer — see isComputePooled(). Factors in any bonus Paw Compute redeemed this period (see CreditStore.grantBonus()) on top of the tier's own configured limit. */
  hasCreditsRemaining(): boolean {
    if (this.isComputePooled()) return true;
    const limit = this.getCreditLimit();
    if (limit === null) return true; // uncapped until a real limit is configured
    const balance = creditStore.getBalance();
    const effectiveLimit = limit + balance.bonusThisPeriod;
    if (effectiveLimit === 0) return false; // a tier with genuinely no AI credit pool at all and no bonus (none today, but the check stays honest if one is ever configured)
    return balance.usedThisPeriod < effectiveLimit;
  }

  /**
   * Grants bonus Paw Compute headroom for the current period only — the local half of redeeming
   * Referral Credits ("Paw Credits") for more compute. The dollar-ledger deduction already happened
   * in Supabase (redeem_referral_credits_for_compute()) before this is ever called; this method has
   * no awareness of money at all, it only ever adds usage headroom to whatever the account's tier
   * already entitles it to — it can never unlock a feature, model, or tier on its own.
   */
  grantComputeBonus(units: number): void {
    creditStore.grantBonus(units);
  }

  getSnapshot(): EntitlementSnapshot {
    const entitlements = this.getEntitlements();
    const balance = creditStore.getBalance();
    return {
      tier: entitlements.tier,
      models: entitlements.models,
      features: entitlements.features,
      runtimeEntitlements: this.getRuntimeEntitlements(),
      creditLimit: entitlements.monthlyCreditLimit,
      creditsUsedThisPeriod: balance.usedThisPeriod,
      bonusComputeThisPeriod: balance.bonusThisPeriod,
      hasCreditsRemaining: this.hasCreditsRemaining(),
      pooled: this.isComputePooled(),
      seatTier: entitlements.seatTier,
    };
  }
}

export const entitlementService = new EntitlementService();
