import { subscriptionStore } from './SubscriptionStore';
import { creditStore } from './CreditStore';
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

const PRO_FEATURES: FeatureId[] = [...GO_FEATURES, 'advancedRuntimes'];

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
];

/**
 * Enterprise's one real distinguishing feature beyond Team: metered
 * Autonomous Engineering Task billing (seat base fee + usage) instead of a
 * flat per-seat rate. Enterprise orgs also get richer RBAC roles
 * (organizationOwner/itAdministrator/securityAdministrator/
 * departmentManager vs Team's flatter owner/admin/member — see
 * ENTERPRISE_ROLES in OrganizationSection.tsx), which is a role list, not a
 * FeatureId gate.
 */
const ENTERPRISE_FEATURES: FeatureId[] = [...TEAM_FEATURES, 'autonomousTaskBilling'];

/**
 * The single source of truth for what a tier unlocks. No runtime should
 * hard-code a tier/feature check of its own — everything goes through
 * EntitlementService below. Paw Go has zero AI models and zero AI credits
 * by design ("No AI models. No AI runtimes. No AI requests.") — its
 * monthlyCreditLimit is 0, not null, because that absence is a deliberate
 * product decision, not an undecided price (contrast with Pro/Team/
 * Enterprise's null, which really is "Business Configuration Required").
 */
const TIER_ENTITLEMENTS: Record<SubscriptionTierId, TierEntitlements> = {
  go: { tier: 'go', models: [], features: GO_FEATURES, monthlyCreditLimit: 0 },
  pro: { tier: 'pro', models: AI_MODELS, features: PRO_FEATURES, monthlyCreditLimit: null },
  proMax: { tier: 'proMax', models: AI_MODELS, features: PRO_MAX_FEATURES, monthlyCreditLimit: null },
  team: { tier: 'team', models: AI_MODELS, features: TEAM_FEATURES, monthlyCreditLimit: null },
  enterprise: { tier: 'enterprise', models: AI_MODELS, features: ENTERPRISE_FEATURES, monthlyCreditLimit: null },
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
   * (both PRO_FEATURES, both uncapped credits) in this codebase, so this
   * isn't a new gap. seatTier is echoed on the result for billing/UI display
   * and as the wiring point for a future real Standard/Premium capability
   * split, not fabricated as a difference that doesn't exist yet.
   */
  getEntitlements(): TierEntitlements {
    const base = TIER_ENTITLEMENTS[this.currentTier()];
    const seatTier = this.getSeatTier();
    return seatTier ? { ...base, seatTier } : base;
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

  /** Non-AI desktop functionality never consumes credits and is never gated by this. */
  hasCreditsRemaining(): boolean {
    const limit = this.getCreditLimit();
    if (limit === null) return true; // uncapped until a real limit is configured
    if (limit === 0) return false; // Paw Go — no AI credit pool at all
    return creditStore.getBalance().usedThisPeriod < limit;
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
      hasCreditsRemaining: this.hasCreditsRemaining(),
      seatTier: entitlements.seatTier,
    };
  }
}

export const entitlementService = new EntitlementService();
