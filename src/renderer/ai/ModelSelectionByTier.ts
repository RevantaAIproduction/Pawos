import type { PawModelId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * Determine the recommended/default Paw model based on subscription tier.
 *
 * Go tier: Paw Flash (budget model, no credits burn)
 * Pro/Pro Max/Team/Enterprise: Paw Core (higher capability)
 *
 * Paw Flash can only be used with explicit usage credits purchase,
 * not with regular tier limits.
 */
export function getDefaultModelForTier(tier: SubscriptionTierId): PawModelId {
  switch (tier) {
    case 'go':
      return 'haiku-paw'; // Paw Flash - lightweight for free tier
    case 'pro':
    case 'proMax':
    case 'team':
    case 'enterprise':
      return 'opus-paw'; // Paw Core - full capability for paid tiers
    default:
      return 'sonnet-paw'; // Paw Swift as fallback
  }
}

/**
 * Check if Paw Flash can be used under current conditions.
 *
 * Paw Flash is only available when:
 * - User explicitly has usage credits, OR
 * - User is on Go tier (but usage is limited)
 *
 * NOT available when using regular tier limits (Pro, Pro Max, etc.)
 */
export function canUsePawFlash(tier: SubscriptionTierId, hasUsageCredits: boolean): boolean {
  if (tier === 'go') {
    return true; // Always can use for Go tier
  }
  // For paid tiers, only with explicit usage credits purchase
  return hasUsageCredits;
}

/**
 * Get list of models available for current tier.
 * Disables Paw Flash if using regular tier limits (not usage credits).
 */
export function getAvailableModelsForTier(
  tier: SubscriptionTierId,
  hasUsageCredits: boolean
): PawModelId[] {
  const allModels: PawModelId[] = ['haiku-paw', 'sonnet-paw', 'opus-paw', 'o1-reasoning-paw'];

  // Filter out Paw Flash if:
  // - Not Go tier AND
  // - No usage credits
  if (tier !== 'go' && !hasUsageCredits) {
    return allModels.filter((m) => m !== 'haiku-paw');
  }

  return allModels;
}
