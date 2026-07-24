import type { BillingProvider } from '../BillingProvider';
import type { BillingCheckoutResult, CheckoutOptions, SubscriptionTierId } from '../../../shared/billing/BillingTypes';

/**
 * Electron never talks to Razorpay directly and never sees a Razorpay secret
 * key — per the production requirement, all Razorpay secrets live on the
 * pawos-web backend only. This provider's only job is to hand back the
 * website's checkout URL so the caller (AccountSection / Subscription UI)
 * can open it in the system browser; the actual charge, webhook handling,
 * and subscription update happen entirely on pawos-web.
 *
 * The pawos-web /checkout page and its /api/billing/checkout + webhook
 * routes are built and typecheck clean (see pawos-web/src/app/checkout and
 * pawos-web/src/app/api/billing) — they honestly report "Business
 * Configuration Required" themselves once real Razorpay keys are missing,
 * so the remaining gate here is purely about deployment: this stays false
 * until pawos-web is actually deployed and reachable at
 * WEB_CHECKOUT_BASE_URL. Flipping it before that would send users to an
 * unreachable domain instead of a clear in-app message, which is worse.
 */
const WEB_CHECKOUT_BASE_URL = 'https://revantaai.com/checkout';
const CHECKOUT_ROUTE_LIVE = false; // flip true once pawos-web is deployed and reachable at WEB_CHECKOUT_BASE_URL

export class RazorpayBillingProvider implements BillingProvider {
  readonly id = 'razorpay' as const;

  isConfigured(): boolean {
    return CHECKOUT_ROUTE_LIVE;
  }

  async createCheckoutSession(tier: SubscriptionTierId, callbackUrl?: string, options?: CheckoutOptions): Promise<BillingCheckoutResult> {
    if (!CHECKOUT_ROUTE_LIVE) {
      return {
        ok: false,
        reason: 'Website checkout is not live yet. Business Configuration Required.',
      };
    }
    const url = new URL(WEB_CHECKOUT_BASE_URL);
    url.searchParams.set('plan', tier);
    if (callbackUrl) url.searchParams.set('callback', callbackUrl);
    if (options?.seatTier) url.searchParams.set('seatTier', options.seatTier);
    if (options?.seatCount) url.searchParams.set('seatCount', String(options.seatCount));
    return { ok: true, checkoutUrl: url.toString() };
  }
}

export const razorpayBillingProvider = new RazorpayBillingProvider();

/**
 * Prepaid Autonomous Engineering Task credit purchases — same
 * deployment-readiness gate as createCheckoutSession above, since it's the
 * same pawos-web deployment (/checkout/credits) that must actually be
 * live. Not part of the BillingProvider interface since it's a one-time
 * purchase, not a subscription-tier checkout — no NoOp/registry indirection
 * needed for a single real provider.
 */
export function createCreditsCheckoutUrl(credits: number, organizationId?: string, callbackUrl?: string): BillingCheckoutResult {
  if (!CHECKOUT_ROUTE_LIVE) {
    return { ok: false, reason: 'Website checkout is not live yet. Business Configuration Required.' };
  }
  const url = new URL(`${WEB_CHECKOUT_BASE_URL}/credits`);
  url.searchParams.set('credits', String(credits));
  if (organizationId) url.searchParams.set('organizationId', organizationId);
  if (callbackUrl) url.searchParams.set('callback', callbackUrl);
  return { ok: true, checkoutUrl: url.toString() };
}
