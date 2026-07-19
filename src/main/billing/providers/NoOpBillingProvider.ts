import type { BillingProvider } from '../BillingProvider';
import type { BillingCheckoutResult } from '../../../shared/billing/BillingTypes';

/** The only billing provider active until a real payment processor is configured. Never fabricates a checkout URL. */
export class NoOpBillingProvider implements BillingProvider {
  readonly id = 'none' as const;

  isConfigured(): boolean {
    return false;
  }

  async createCheckoutSession(): Promise<BillingCheckoutResult> {
    return {
      ok: false,
      reason: 'No payment provider is configured yet. Business Configuration Required.',
    };
  }
}

export const noOpBillingProvider = new NoOpBillingProvider();
