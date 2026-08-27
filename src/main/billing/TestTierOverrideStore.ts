/**
 * Test Tier Override Store — Internal admin mechanism for testing entitlements.
 *
 * Allows authorized internal accounts to test different tiers without modifying
 * real billing records. This is for TESTING ONLY and must not affect customer
 * accounts or billing.
 *
 * Authorized accounts:
 * - tharun@revantaai.com
 * - founder@revantaai.com
 * - pawos@revantaai.com
 */

import type { SubscriptionTierId } from '../../shared/billing/BillingTypes';

const AUTHORIZED_ADMINS = new Set([
  'tharun@revantaai.com',
  'founder@revantaai.com',
  'pawos@revantaai.com',
]);

export interface TestTierOverride {
  userId: string;
  overrideTier: SubscriptionTierId;
  realTier: SubscriptionTierId;
  appliedAt: number;
  appliedBy: string;
}

class TestTierOverrideStore {
  private overrides = new Map<string, TestTierOverride>();

  /**
   * Check if an account is authorized to use the test tier switcher.
   * Server-side check only — not based on any client-supplied flag.
   */
  isAuthorized(userEmail: string | null | undefined): boolean {
    if (!userEmail) return false;
    return AUTHORIZED_ADMINS.has(userEmail.toLowerCase());
  }

  /**
   * Get current test override for a user, or undefined if none.
   */
  getOverride(userId: string): TestTierOverride | undefined {
    return this.overrides.get(userId);
  }

  /**
   * Apply a test tier override for a user.
   * Caller MUST verify authorization before calling.
   */
  setOverride(userId: string, realTier: SubscriptionTierId, testTier: SubscriptionTierId, appliedBy: string): void {
    this.overrides.set(userId, {
      userId,
      overrideTier: testTier,
      realTier,
      appliedAt: Date.now(),
      appliedBy,
    });
  }

  /**
   * Clear test override for a user, reverting to real tier.
   */
  clearOverride(userId: string): void {
    this.overrides.delete(userId);
  }

  /**
   * Get effective tier: test override if present, otherwise real tier.
   */
  getEffectiveTier(userId: string, realTier: SubscriptionTierId): SubscriptionTierId {
    const override = this.overrides.get(userId);
    return override ? override.overrideTier : realTier;
  }

  /**
   * Check if a user has an active test override.
   */
  hasOverride(userId: string): boolean {
    return this.overrides.has(userId);
  }

  /**
   * For audit logging and testing.
   */
  getAllOverrides(): TestTierOverride[] {
    return Array.from(this.overrides.values());
  }
}

export const testTierOverrideStore = new TestTierOverrideStore();
