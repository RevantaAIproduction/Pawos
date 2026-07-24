import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { SUBSCRIPTION_TIER_ORDER, type SeatTier, type SubscriptionState, type SubscriptionTierId } from '../../shared/billing/BillingTypes';

const FILE_NAME = 'subscription.json';

function defaultState(): SubscriptionState {
  return { tier: 'go', status: 'none' };
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
      this.state = { ...defaultState(), ...JSON.parse(fs.readFileSync(this.file, 'utf-8')) };
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

  /** UI-only tier selection — no payment is taken. status stays 'none' since nothing was actually purchased. */
  setTier(tier: SubscriptionTierId): SubscriptionState {
    this.state = { tier, status: 'none' };
    this.save();
    return this.state;
  }

  /** Called only from CheckoutSyncServer's verified local callback after a real Razorpay payment completed — the one path where status legitimately becomes 'active'. */
  confirmPurchase(tier: SubscriptionTierId): SubscriptionState {
    this.state = { tier, status: 'active', renewsAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
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
      this.state = { tier: orgTier, status: 'active', seatTier: orgTier === 'team' ? seatTier : undefined };
      this.save();
    } else if (orgTier === this.state.tier && orgTier === 'team' && seatTier) {
      this.state = { ...this.state, seatTier };
      this.save();
    }
    return this.state;
  }
}

export const subscriptionStore = new SubscriptionStore();
