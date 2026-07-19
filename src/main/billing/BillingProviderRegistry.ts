import type { BillingProviderId } from '../../shared/billing/BillingTypes';
import type { BillingProvider } from './BillingProvider';
import { noOpBillingProvider } from './providers/NoOpBillingProvider';

/**
 * Same registry pattern as ReasoningProviderRegistry — the rest of PawOS
 * asks for "the active billing provider" and never names one directly.
 * Only 'none' is implemented today; 'stripe' is reserved so
 * PricingConfig.billingProvider can already reference it without this
 * registry needing to change shape once a real Stripe integration exists.
 */
export function createBillingProvider(id: BillingProviderId): BillingProvider {
  switch (id) {
    case 'stripe':
      // Not implemented — no processor is configured yet (Business Configuration Required).
      return noOpBillingProvider;
    case 'none':
    default:
      return noOpBillingProvider;
  }
}
