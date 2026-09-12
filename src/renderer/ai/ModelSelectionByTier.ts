import type { PawModelId, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * Model Compute Consumption Hierarchy:
 * - Paw Flash: Normal (20 units) - available with regular tier limits
 * - Paw Swift: Normal (20 units)
 * - Paw Core: Double (40 units) - burns 2x
 * - Paw Fable: Triple (60 units) - burns 3x, ONLY with usage credits
 *
 * Go tier: Paw Flash (normal consumption, regular limits)
 * Pro/Pro Max/Team/Enterprise: Paw Core (double consumption, regular limits)
 *
 * Paw Fable ONLY available when user has explicit usage credits.
 */

export function getDefaultModelForTier(tier: SubscriptionTierId): PawModelId {
  switch (tier) {
    case 'go':
      return 'paw-flash'; // Paw Flash - normal consumption for free tier
    case 'pro':
    case 'proMax':
    case 'team':
    case 'enterprise':
      return 'paw-core'; // Paw Core - double consumption for paid tiers
    default:
      return 'paw-flash'; // Default to Flash as fallback
  }
}

/**
 * Check if Paw Fable can be used under current conditions.
 *
 * Paw Fable ONLY works with explicit usage credits, never with regular tier limits.
 * It burns 3x the compute of normal models (60 units vs 20).
 */
export function canUsePawFable(hasUsageCredits: boolean): boolean {
  return hasUsageCredits; // Only available with usage credits
}

/**
 * Get list of models available for current tier.
 * Paw Fable excluded unless user has usage credits (burns 3x compute).
 */
export function getAvailableModelsForTier(
  tier: SubscriptionTierId,
  hasUsageCredits: boolean
): PawModelId[] {
  // Base models available by tier
  const baseModels: Record<SubscriptionTierId, PawModelId[]> = {
    go: ['paw-flash'], // Go tier: only Flash (normal consumption)
    pro: ['paw-flash', 'paw-swift', 'paw-core'], // Pro: up to Core (double consumption)
    proMax: ['paw-flash', 'paw-swift', 'paw-core'], // Pro Max: full access except Fable
    team: ['paw-flash', 'paw-swift', 'paw-core'], // Team: full access except Fable
    enterprise: ['paw-flash', 'paw-swift', 'paw-core'], // Enterprise: full access except Fable
  };

  const models = baseModels[tier] || ['paw-flash'];

  // Paw Fable ONLY available with usage credits (3x burn)
  if (hasUsageCredits) {
    models.push('paw-fable');
  }

  return models;
}
