import type { BillingCheckoutResult, BillingProviderId, CheckoutOptions, SubscriptionTierId } from '../../shared/billing/BillingTypes';

/**
 * Payment provider abstraction — mirrors the existing
 * ReasoningProviderRegistry / EmailAccountAdapter pattern already used
 * elsewhere in PawOS: one interface, one registry, swap providers via
 * config only. No processor is wired up yet (no Stripe dependency, no API
 * keys) — NoOpBillingProvider is the only real implementation until a
 * payment processor is chosen (Business Configuration Required). A future
 * StripeBillingProvider (or any other processor) implements this same
 * interface and registers alongside it — no call site changes needed.
 */
export interface BillingProvider {
  readonly id: BillingProviderId;
  isConfigured(): boolean;
  /**
   * callbackUrl, when provided, is a local loopback URL (see
   * CheckoutSyncServer.ts) the checkout page pings after a real payment
   * completes. `options` carries seat-tier/seat-count for Team's
   * Standard/Premium split — see CheckoutOptions.
   */
  createCheckoutSession(tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions): Promise<BillingCheckoutResult>;
}
