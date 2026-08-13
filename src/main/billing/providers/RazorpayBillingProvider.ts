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
 * so the remaining gate here was purely about deployment. Confirmed live at
 * WEB_CHECKOUT_BASE_URL on 2026-08-02 (real page renders, RAZORPAY_KEY_ID/
 * SECRET are configured on pawos-web's own deployment — the checkout POST
 * gets past the credentials check). pawos-web still self-reports "No
 * Razorpay plan is configured for Paw <tier>" until RAZORPAY_PLAN_ID_PRO /
 * _PROMAX / _TEAM_STANDARD / _TEAM_PREMIUM / _ENTERPRISE_BASE are created in
 * the Razorpay Dashboard and set on pawos-web's deployment — that gap is
 * pawos-web's own honest 503, not something this flag controls.
 */
const WEB_CHECKOUT_BASE_URL = 'https://pawos.revantaai.com/checkout';
const CHECKOUT_ROUTE_LIVE = true;

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
    if (options?.runtimeIds?.length) url.searchParams.set('runtimeIds', options.runtimeIds.join(','));
    return { ok: true, checkoutUrl: url.toString() };
  }
}

export const razorpayBillingProvider = new RazorpayBillingProvider();

/**
 * Ticket Balance top-ups — same deployment-readiness gate as
 * createCheckoutSession above, since it's the same pawos-web deployment
 * (/checkout/credits) that must actually be live. Not part of the
 * BillingProvider interface since it's a one-time dollar top-up, not a
 * subscription-tier checkout — no NoOp/registry indirection needed for a
 * single real provider.
 */
export function createCreditsCheckoutUrl(amountUsd: number, organizationId?: string, callbackUrl?: string): BillingCheckoutResult {
  if (!CHECKOUT_ROUTE_LIVE) {
    return { ok: false, reason: 'Website checkout is not live yet. Business Configuration Required.' };
  }
  const url = new URL(`${WEB_CHECKOUT_BASE_URL}/credits`);
  url.searchParams.set('amountUsd', String(amountUsd));
  if (organizationId) url.searchParams.set('organizationId', organizationId);
  if (callbackUrl) url.searchParams.set('callback', callbackUrl);
  return { ok: true, checkoutUrl: url.toString() };
}
