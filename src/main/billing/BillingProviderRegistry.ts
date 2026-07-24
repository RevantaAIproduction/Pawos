import type { BillingProviderId } from '../../shared/billing/BillingTypes';
import type { BillingProvider } from './BillingProvider';
import { noOpBillingProvider } from './providers/NoOpBillingProvider';
import { razorpayBillingProvider } from './providers/RazorpayBillingProvider';

/**
 * Same registry pattern as ReasoningProviderRegistry — the rest of PawOS
 * asks for "the active billing provider" and never names one directly.
 * RazorpayBillingProvider is real once RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET
 * are configured server-side; until then it honestly reports itself as
 * unconfigured (Business Configuration Required), same as NoOpBillingProvider.
 */
export function createBillingProvider(id: BillingProviderId): BillingProvider {
  switch (id) {
    case 'razorpay':
      return razorpayBillingProvider;
    case 'none':
    default:
      return noOpBillingProvider;
  }
}
