import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
  SUBSCRIPTION_TIER_ORDER,
  type RuntimeEntitlementGrant,
  type RuntimeEntitlementId,
  type SeatTier,
  type SubscriptionState,
  type SubscriptionTierId,
} from '../../shared/billing/BillingTypes';
import { ALL_RUNTIME_ENTITLEMENT_IDS, filterPurchasableRuntimeIds } from '../../shared/billing/RuntimeCatalog';

const FILE_NAME = 'subscription.json';
const RUNTIME_ENTITLEMENT_POLICY_VERSION = 1;

function defaultState(): SubscriptionState {
  return { tier: 'go', status: 'none', runtimeEntitlementPolicyVersion: RUNTIME_ENTITLEMENT_POLICY_VERSION };
}

function isActiveStatus(status: SubscriptionState['status']): boolean {
  return status === 'active' || status === 'trialing';
}

/**
 * The account-level subscription tier — separate from
 * src/main/execution/CodingModeStore.ts (the Coding Runtime's own local
 * capability toggle). Setting a tier here is currently UI-only: no payment
 * provider is configured, so `status` can only ever be 'none' until a real
 * BillingProvider (see BillingProviderRegistry.ts) actually completes a
 * checkout. Matches the onboarding spec's "Paw Go / Paw Pro selection (UI
 * only; no real billing dependency)".
 */
class SubscriptionStore {
  private file = '';
  private state: SubscriptionState = defaultState();

  init(): void {
    this.file = path.join(app.getPath('userData'), 'billing', FILE_NAME);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as SubscriptionState;
      this.state = { ...defaultState(), ...parsed };
      this.migrateLegacyRuntimeEntitlements(parsed);
    } catch {
      this.save();
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  get(): SubscriptionState {
    return this.state;
  }

  getEffective(): SubscriptionState {
    const state = this.get();
    if (!isActiveStatus(state.status)) {
      return {
        ...defaultState(),
        accountId: state.accountId,
        runtimeEntitlements: this.getPurchasedRuntimeEntitlements(),
      };
    }
    return state;
  }

  getPurchasedRuntimeEntitlements(): RuntimeEntitlementGrant[] {
    const state = this.get();
    const grants = state.runtimeEntitlements ?? [];
    if (isActiveStatus(state.status)) return [...grants];
    return this.purchaseRuntimeEntitlementsOnly();
  }

  private purchaseRuntimeEntitlementsOnly(): RuntimeEntitlementGrant[] {
    return (this.state.runtimeEntitlements ?? []).filter((grant) => grant.source === 'purchase');
  }

  private mergeRuntimeEntitlements(
    runtimeIds: RuntimeEntitlementId[],
    orderId: string | undefined,
    source: RuntimeEntitlementGrant['source'],
    tier: SubscriptionTierId,
    validatePurchasable: boolean
  ): RuntimeEntitlementGrant[] {
    const grantableRuntimeIds = validatePurchasable ? filterPurchasableRuntimeIds(runtimeIds, tier) : runtimeIds;
    const existing = new Set((this.state.runtimeEntitlements ?? []).map((grant) => grant.runtimeId));
    const grants = [...(this.state.runtimeEntitlements ?? [])];
    for (const runtimeId of grantableRuntimeIds) {
      if (existing.has(runtimeId)) continue;
      existing.add(runtimeId);
      grants.push({ runtimeId, source, grantedAt: Date.now(), orderId });
    }
    return grants;
  }

  private migrateLegacyRuntimeEntitlements(parsed: SubscriptionState): void {
    if (parsed.runtimeEntitlementPolicyVersion !== undefined) return;

    const shouldGrandfather =
      (parsed.tier === 'pro' || parsed.tier === 'proMax') && (parsed.status === 'active' || parsed.status === 'trialing');
    if (shouldGrandfather) {
      this.state = {
        ...this.state,
        runtimeEntitlements: this.mergeRuntimeEntitlements(
          ALL_RUNTIME_ENTITLEMENT_IDS,
          'legacy-plan-grandfather',
          'plan',
          parsed.tier,
          false
        ),
        runtimeEntitlementsGrandfatheredAt: Date.now(),
      };
    }

    this.state = { ...this.state, runtimeEntitlementPolicyVersion: RUNTIME_ENTITLEMENT_POLICY_VERSION };
    this.save();
  }

  addRuntimeEntitlements(
    runtimeIds: RuntimeEntitlementId[],
    orderId?: string,
    options: { tier?: SubscriptionTierId; validatePurchasable?: boolean; source?: RuntimeEntitlementGrant['source'] } = {}
  ): SubscriptionState {
    const tier = options.tier ?? this.state.tier;
    const source = options.source ?? 'purchase';
    const grants = this.mergeRuntimeEntitlements(runtimeIds, orderId, source, tier, Boolean(options.validatePurchasable));
    this.state = { ...this.state, runtimeEntitlements: grants };
    this.save();
    return this.state;
  }

  diffRuntimeEntitlements(requested: RuntimeEntitlementId[]): RuntimeEntitlementId[] {
    const existing = new Set((this.state.runtimeEntitlements ?? []).map((grant) => grant.runtimeId));
    return requested.filter((runtimeId, index) => requested.indexOf(runtimeId) === index && !existing.has(runtimeId));
  }

  /** UI-only tier selection — no payment is taken. status stays 'none' since nothing was actually purchased. */
  setTier(tier: SubscriptionTierId): SubscriptionState {
    this.state = {
      tier,
      status: 'none',
      runtimeEntitlements: this.state.runtimeEntitlements,
      accountId: this.state.accountId,
      runtimeEntitlementPolicyVersion: RUNTIME_ENTITLEMENT_POLICY_VERSION,
    };
    this.save();
    return this.state;
  }

  /**
   * Resets local subscription state back to the free default. This file is one JSON file per
   * device install, not namespaced per signed-in account (see AuthenticationProvider's own comment
   * on why none of PawOS's local stores are per-user yet) — so without this, an account that once
   * joined/created a Team/Enterprise org (which only ever raises the tier via syncFromOrganization,
   * never lowers it) leaves every subsequently signed-in account on the same device looking like a
   * Team member forever. Called on sign-out so a fresh sign-in starts clean; the next account's own
   * real org membership (if any) re-elevates it correctly via syncFromOrganization on that sign-in.
   */
  reset(): SubscriptionState {
    this.state = defaultState();
    this.save();
    return this.state;
  }

  reconcileForAccount(accountId: string): SubscriptionState {
    const legacyUnowned = !this.state.accountId;
    const belongsToAnotherAccount = Boolean(this.state.accountId && this.state.accountId !== accountId);
    const inactivePaidOrOrgTier = this.state.status === 'none' && this.state.tier !== 'go';
    const legacyUnownedOrganizationTier =
      legacyUnowned && isActiveStatus(this.state.status) && (this.state.tier === 'team' || this.state.tier === 'enterprise');

    if (belongsToAnotherAccount) {
      this.state = { ...defaultState(), accountId };
      this.save();
      return this.state;
    }

    if (inactivePaidOrOrgTier || legacyUnownedOrganizationTier) {
      this.state = {
        ...defaultState(),
        accountId,
        runtimeEntitlements: this.purchaseRuntimeEntitlementsOnly(),
      };
      this.save();
      return this.state;
    }

    this.state = { ...this.state, accountId };
    this.save();
    return this.getEffective();
  }

  /** Called only from CheckoutSyncServer's verified local callback after a real Razorpay payment completed — the one path where status legitimately becomes 'active'. */
  confirmPurchase(tier: SubscriptionTierId, options: { runtimeIds?: RuntimeEntitlementId[]; orderId?: string; proMaxVariant?: string; proBillingFrequency?: 'monthly' | 'yearly' } = {}): SubscriptionState {
    // Pro yearly renews in 365 days; everything else in 30 days
    const renewDays = tier === 'pro' && options.proBillingFrequency === 'yearly' ? 365 : 30;

    this.state = {
      ...this.state,
      tier,
      status: 'active',
      accountId: this.state.accountId,
      renewsAt: Date.now() + renewDays * 24 * 60 * 60 * 1000,
      runtimeEntitlementPolicyVersion: RUNTIME_ENTITLEMENT_POLICY_VERSION,
      ...(tier === 'proMax' && options.proMaxVariant ? { proMaxVariant: options.proMaxVariant as import('../../shared/billing/BillingTypes').ProMaxVariant } : {}),
      ...(tier === 'pro' && options.proBillingFrequency ? { proBillingFrequency: options.proBillingFrequency } : {}),
    };
    if (options.runtimeIds?.length) {
      this.state = {
        ...this.state,
        runtimeEntitlements: this.mergeRuntimeEntitlements(options.runtimeIds, options.orderId, 'purchase', tier, true),
      };
    }
    this.save();
    return this.state;
  }

  /**
   * Called when this account becomes an active member of a Team/Enterprise
   * organization (see acceptInvite() in OrganizationSection.tsx) — a
   * teammate never pays individually, the org owner's seats cover them, so
   * accepting the invite itself is what grants access. Only ever raises the
   * tier: never downgrades an account that already has an equal-or-higher
   * personal subscription of its own. `seatTier` is only meaningful for
   * 'team' (Standard/Premium); Enterprise seats are uniform, so it's
   * omitted there.
   */
  syncFromOrganization(orgTier: SubscriptionTierId, seatTier?: SeatTier): SubscriptionState {
    if (SUBSCRIPTION_TIER_ORDER.indexOf(orgTier) > SUBSCRIPTION_TIER_ORDER.indexOf(this.state.tier)) {
      this.state = {
        ...this.state,
        tier: orgTier,
        status: 'active',
        accountId: this.state.accountId,
        seatTier: orgTier === 'team' ? seatTier : undefined,
        runtimeEntitlementPolicyVersion: RUNTIME_ENTITLEMENT_POLICY_VERSION,
      };
      this.save();
    } else if (orgTier === this.state.tier && orgTier === 'team' && seatTier) {
      this.state = { ...this.state, seatTier };
      this.save();
    }
    return this.state;
  }
}

export const subscriptionStore = new SubscriptionStore();
