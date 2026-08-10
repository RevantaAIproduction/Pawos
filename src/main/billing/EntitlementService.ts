import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
import { usageQuotaConfigStore } from './UsageQuotaConfigStore';
import type { EntitlementSnapshot, FeatureId, SeatTier, SubscriptionTierId, TierEntitlements } from '../../shared/billing/BillingTypes';
import type { PawModelId } from '../../shared/ai/PawModelTypes';

const GO_FEATURES: FeatureId[] = [
  'companionStudio',
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
 * personal Mobile Presence experience; Pro Max is identical (see
 * PRO_MAX_FEATURES below) and differs only in usage capacity, never in
 * feature availability.
 */
const PRO_FEATURES: FeatureId[] = [...GO_FEATURES, 'advancedRuntimes', 'mobilePairing', 'crossDeviceSync', 'mobileNotifications'];

/** Deliberately identical to PRO_FEATURES — Pro Max must never introduce a feature difference from Pro, only a usage-capacity difference (enforced by UsageQuotaConfigStore, not here). */
const PRO_MAX_FEATURES: FeatureId[] = [...PRO_FEATURES];

/**
 * Every real organization-scoped runtime capability shipped so far
 * (Phases P1-P6): shared workspaces/companions/credits, admin controls,
 * task management, Git collaboration (AI PR review), Remote Assistance,
 * CRM projection, and Governance & Security (credential vault, approval
 * queue, audit log, SSO). GovernanceGate.ts and OrganizationSection.tsx
 * both apply these to ANY organization tier — Team or Enterprise — so they
 * belong on the Team baseline, not gated as Enterprise-exclusive.
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
  'connectLinear',
  'connectGoogleWorkspace',
  'connectJira',
  'connectSlack',
];

/**
 * Enterprise's distinguishing features beyond Team: metered Autonomous
 * Engineering Task billing (seat base fee + usage) instead of a flat
 * per-seat rate, plus organizationCrossDeviceAlerts — Team members get
 * personal Mobile Presence (their own devices/notifications, per-user, not
 * pooled) via TEAM_FEATURES already inheriting PRO_MAX_FEATURES, but only
 * Enterprise additionally routes org-wide governance/security/deployment
 * alerts to trusted devices (Cross Device Runtime checks this feature
 * before publishing an organizationAlert/securityAlert/deploymentAlert
 * cross-device event, vs. a personal taskCompleted/approvalRequired event
 * which only needs crossDeviceSync). Enterprise orgs also get richer RBAC
 * roles (organizationOwner/itAdministrator/securityAdministrator/
 * departmentManager vs Team's flatter owner/admin/member — see
 * ENTERPRISE_ROLES in OrganizationSection.tsx), which is a role list, not a
 * FeatureId gate.
 */
const ENTERPRISE_FEATURES: FeatureId[] = [...TEAM_FEATURES, 'autonomousTaskBilling', 'organizationCrossDeviceAlerts'];

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
    return subscriptionStore.get().tier;
  }

  /** Only meaningful for 'team' — which seat rate (Standard/Premium) this account was assigned. */
  getSeatTier(): SeatTier | undefined {
    const state = subscriptionStore.get();
    return state.tier === 'team' ? state.seatTier : undefined;
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

  isFeatureAvailable(featureId: FeatureId): boolean {
    return this.getEntitlements().features.includes(featureId);
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
