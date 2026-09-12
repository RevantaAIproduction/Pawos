import type { PawModelId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * Determine the recommended/default Paw model based on subscription tier.
 *
 * Go tier: Paw Fable (reasoning model, usage credits only)
 * Pro/Pro Max/Team/Enterprise: Paw Core (higher capability)
 *
 * Paw Fable can only be used with explicit usage credits purchase,
 * not with regular tier limits.
 */
export function getDefaultModelForTier(tier: SubscriptionTierId): PawModelId {
  switch (tier) {
    case 'go':
      return 'paw-fable'; // Paw Fable - reasoning model for free tier (usage credits only)
    case 'pro':
    case 'proMax':
    case 'team':
    case 'enterprise':
      return 'paw-core'; // Paw Core - full capability for paid tiers
    default:
      return 'paw-swift'; // Paw Swift as fallback
  }
}

/**
 * Check if Paw Fable can be used under current conditions.
 *
 * Paw Fable is only available when:
 * - User explicitly has usage credits, OR
 * - User is on Go tier (but usage is limited to available credits)
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
 * Disables Paw Fable if using regular tier limits (not usage credits).
 */
export function getAvailableModelsForTier(
  tier: SubscriptionTierId,
  hasUsageCredits: boolean
): PawModelId[] {
  const allModels: PawModelId[] = ['paw-flash', 'paw-swift', 'paw-core', 'paw-fable'];

  // Filter out Paw Fable if:
  // - Not Go tier AND
  // - No usage credits
  if (tier !== 'go' && !hasUsageCredits) {
    return allModels.filter((m) => m !== 'paw-fable');
  }

  return allModels;
}
