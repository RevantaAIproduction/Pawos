/**
 * Admin/Test Tier Handler — Internal testing infrastructure.
 *
 * Manages test tier overrides for authorized internal accounts only.
 * Persists to database via Supabase (called from renderer which has auth access).
 *
 * Server-side authorization check is mandatory.
 */

import { testTierOverrideStore } from '../../billing/TestTierOverrideStore';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';

const AUTHORIZED_ADMINS = new Set([
  'tharun@revantaai.com',
  'founder@revantaai.com',
  'pawos@revantaai.com',
]);

export interface TestTierRequest {
  tier: SubscriptionTierId;
  userEmail: string;
  userId: string;
  organizationId?: string;
}

export interface TestTierResponse {
  ok: boolean;
  reason?: string;
  override?: {
    realTier: SubscriptionTierId;
    testTier: SubscriptionTierId;
    appliedAt: number;
  };
}

export interface ClearTierOverrideRequest {
  userId: string;
  userEmail: string;
  organizationId?: string;
}

/**
 * Server-side authorization check for internal admins.
 */
function isAuthorizedAdmin(userEmail: string | null | undefined): boolean {
  if (!userEmail) return false;
  return AUTHORIZED_ADMINS.has(userEmail.toLowerCase());
}

/**
 * Apply a test tier override.
 * Persists to database via Supabase RLS.
 * Server-side validates authorization.
 */
export async function applyTestTier(request: TestTierRequest): Promise<TestTierResponse> {
  // Server-side authorization check — MUST happen before any state change
  if (!isAuthorizedAdmin(request.userEmail)) {
    return {
      ok: false,
      reason: `Access denied: ${request.userEmail} is not authorized to use test tier overrides.`,
    };
  }

  try {
    // Get the real tier first
    const { subscriptionStore } = await import('../../billing/SubscriptionStore');
    const realTier = subscriptionStore.getEffective().tier;

    // Also update in-memory store for this session
    testTierOverrideStore.setOverride(request.userId, realTier, request.tier, request.userEmail);

    // NOTE: Database persistence would happen via Supabase from renderer
    // This handler just updates in-memory; the renderer will persist to DB

    return {
      ok: true,
      override: {
        realTier,
        testTier: request.tier,
        appliedAt: Date.now(),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to apply test tier',
    };
  }
}

/**
 * Clear test tier override, reverting to real tier.
 */
export async function clearTestTierOverride(request: ClearTierOverrideRequest): Promise<TestTierResponse> {
  // Server-side authorization check
  if (!isAuthorizedAdmin(request.userEmail)) {
    return {
      ok: false,
      reason: `Access denied: ${request.userEmail} is not authorized.`,
    };
  }

  try {
    testTierOverrideStore.clearOverride(request.userId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to clear test tier',
    };
  }
}

/**
 * Get current test tier override for a user.
 */
export async function getTestTierOverride(
  userId: string,
  userEmail: string
): Promise<TestTierResponse> {
  // Authorization check
  if (!isAuthorizedAdmin(userEmail)) {
    return {
      ok: false,
      reason: `Access denied`,
    };
  }

  try {
    const override = testTierOverrideStore.getOverride(userId);
    if (!override) {
      return {
        ok: true,
        reason: 'No test override active',
      };
    }

    return {
      ok: true,
      override: {
        realTier: override.realTier,
        testTier: override.overrideTier,
        appliedAt: override.appliedAt,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to get test tier override',
    };
  }
}

/**
 * Hydrate test tier override from database.
 * Called on app startup to restore persisted override.
 */
export async function hydrateTestTier(input: {
  userId: string;
  realTier: SubscriptionTierId;
  testTier: SubscriptionTierId;
}): Promise<{ ok: boolean; reason?: string }> {
  try {
    testTierOverrideStore.setOverride(input.userId, input.realTier, input.testTier, 'database');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Failed to hydrate test tier',
    };
  }
}
