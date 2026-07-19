import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { SubscriptionState, SubscriptionTierId } from '../../shared/billing/BillingTypes';

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
}

export const subscriptionStore = new SubscriptionStore();
