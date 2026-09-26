// @ts-nocheck
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';
import type { SubscriptionTierId, ProMaxVariant } from '../../../../shared/billing/BillingTypes';

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface TierPaymentHandler {
  payForTier: (tier: SubscriptionTierId, options?: { proMaxVariant?: ProMaxVariant; proBillingFrequency?: string }) => Promise<void>;
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
  userEmail: string;
}

/**
 * Pro / Pro Max checkout — a real Razorpay SUBSCRIPTION (renews automatically), never a one-time
 * order. (Ticket Balance and Usage Credits are the one-time orders.)
 *
 *   1. /api/billing/checkout creates the subscription on the right Razorpay plan (Pro monthly /
 *      Pro yearly / Pro Max 5x / Pro Max 20x), with the buyer's userId stamped server-side.
 *   2. Razorpay's own checkout collects the payment and the recurring mandate (card / UPI autopay).
 *   3. verify-subscription checks Razorpay's signature, saves the plan against the account
 *      (pawos_subscriptions) and returns the tier — the app activates it immediately, then re-syncs
 *      from the server so the plan follows the account on every sign-in until it ends.
 */
export async function initiateRazorpayTierPayment(
  tier: SubscriptionTierId,
  options: TierPaymentHandler,
  paymentOptions?: { proMaxVariant?: ProMaxVariant; proBillingFrequency?: string }
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      options.setMessage('[error] Sign in required');
      options.setBusy(false);
      return;
    }

    const checkoutOptions = {
      ...(tier === 'proMax' && paymentOptions?.proMaxVariant ? { proMaxVariant: paymentOptions.proMaxVariant } : {}),
      ...(tier === 'pro' ? { proBillingFrequency: paymentOptions?.proBillingFrequency === 'yearly' ? 'yearly' : 'monthly' } : {}),
    };
    const result = await ipc.billingCreateNativeSubscriptionCheckout(tier, checkoutOptions, accessToken);
    if (!result.ok) {
      options.setMessage(`[error] ${result.reason}`);
      options.setBusy(false);
      return;
    }

    loadRazorpayAndPay(result, options, tier, accessToken);
  } catch (error) {
    options.setMessage(`[error] ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

function loadRazorpayAndPay(result: any, options: TierPaymentHandler, tier: SubscriptionTierId, accessToken: string) {
  if (!window.Razorpay) {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => openRazorpayCheckout(result, options, tier, accessToken);
    script.onerror = () => {
      options.setMessage('[error] Failed to load payment');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, tier, accessToken);
  }
}

function openRazorpayCheckout(result: any, options: TierPaymentHandler, tier: SubscriptionTierId, accessToken: string) {
  const razorpayOptions = {
    key: result.keyId,
    // A subscription (not an order): Razorpay charges the plan's own price and sets up renewal.
    subscription_id: result.subscriptionId,
    name: 'PawOS',
    description: `PawOS ${tier === 'proMax' ? 'Pro Max' : 'Pro'} subscription`,
    prefill: {
      email: options.userEmail,
    },
    handler: async (response: any) => {
      await handlePaymentSuccess(response, result, options, accessToken);
    },
    modal: {
      ondismiss: () => {
        options.setMessage('Payment cancelled');
        options.setBusy(false);
      },
    },
  };

  try {
    const razorpay = new window.Razorpay(razorpayOptions);
    razorpay.open();
  } catch (error) {
    options.setMessage(`[error] Payment error: ${error instanceof Error ? error.message : String(error)}`);
    options.setBusy(false);
  }
}

async function handlePaymentSuccess(response: any, result: any, options: TierPaymentHandler, accessToken: string) {
  try {
    const verified = await ipc.billingConfirmNativeSubscriptionPayment(
      response.razorpay_payment_id,
      response.razorpay_subscription_id ?? result.subscriptionId,
      response.razorpay_signature,
      accessToken
    );
    if (!verified.ok) {
      options.setMessage(`[error] Verification failed: ${verified.reason}. If you were charged, contact support — your payment is safe.`);
      return;
    }
    // The plan is saved against the account server-side; re-sync so every screen shows it now.
    await ipc.billingSyncBuildAccess(accessToken).catch(() => undefined);
    options.setMessage('✅ Payment successful! Your plan is active.');
    setTimeout(() => options.refresh(), 1500);
  } catch (error) {
    options.setMessage(`[error] Error: ${error}`);
  } finally {
    options.setBusy(false);
  }
}
