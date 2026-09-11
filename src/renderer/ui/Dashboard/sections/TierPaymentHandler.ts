import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';
import type { SubscriptionTierId, ProMaxVariant } from '../../../../shared/billing/BillingTypes';

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

export async function initiateRazorpayTierPayment(
  tier: SubscriptionTierId,
  options: TierPaymentHandler,
  paymentOptions?: { proMaxVariant?: ProMaxVariant; proBillingFrequency?: string }
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    // Get access token
    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      options.setMessage('❌ Sign in required');
      options.setBusy(false);
      return;
    }

    // Create order
    const result = await ipc.billingCreateNativeTierCheckout(tier, paymentOptions, undefined, accessToken);

    if (!result.ok) {
      options.setMessage(`❌ ${result.reason}`);
      options.setBusy(false);
      return;
    }

    // Load Razorpay and open checkout
    loadRazorpayAndPay(result, options, tier);
  } catch (error) {
    options.setMessage(`❌ ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

function loadRazorpayAndPay(result: any, options: TierPaymentHandler, tier: SubscriptionTierId) {
  if (!window.Razorpay) {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
    script.async = true;
    script.onload = () => {
      // Wait for Razorpay to be available
      setTimeout(() => {
        if (window.Razorpay && typeof window.Razorpay === 'function') {
          openRazorpayCheckout(result, options, tier);
        } else {
          options.setMessage('❌ Payment system failed to initialize');
          options.setBusy(false);
        }
      }, 100);
    };
    script.onerror = () => {
      options.setMessage('❌ Failed to load payment');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, tier);
  }
}

function openRazorpayCheckout(result: any, options: TierPaymentHandler, tier: SubscriptionTierId) {
  if (!result.keyId || !result.orderId) {
    options.setMessage('❌ Invalid payment configuration');
    options.setBusy(false);
    return;
  }

  const razorpayOptions = {
    key: result.keyId,
    order_id: result.orderId,
    amount: result.amountPaise,
    currency: result.currency || 'INR',
    name: 'PawOS',
    description: `PawOS ${tier} Tier`,
    prefill: {
      email: options.userEmail,
    },
    handler: async (response: any) => {
      await handlePaymentSuccess(response, result, options, tier);
    },
    modal: {
      ondismiss: () => {
        options.setMessage('Payment cancelled');
        options.setBusy(false);
      },
    },
  };

  try {
    if (!window.Razorpay || typeof window.Razorpay !== 'function') {
      options.setMessage('❌ Payment system unavailable');
      options.setBusy(false);
      return;
    }

    console.log('Creating Razorpay checkout...');
    const razorpay = new window.Razorpay(razorpayOptions);
    console.log('Razorpay instance type:', typeof razorpay);
    console.log('Razorpay instance:', razorpay);

    if (!razorpay || typeof razorpay.open !== 'function') {
      console.log('ERROR: razorpay.open is not a function');
      console.log('razorpay keys:', Object.keys(razorpay || {}));
      options.setMessage('❌ Payment initialization failed');
      options.setBusy(false);
      return;
    }

    console.log('Calling razorpay.open()...');
    razorpay.open();
  } catch (error) {
    console.log('Checkout error:', error);
    options.setMessage(`❌ Payment error: ${error instanceof Error ? error.message : String(error)}`);
    options.setBusy(false);
  }
}

async function handlePaymentSuccess(response: any, result: any, options: TierPaymentHandler, tier: SubscriptionTierId) {
  try {
    const verifyResult = await ipc.billingVerifyNativeTierPayment({
      tier,
      orderId: result.orderId,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    });

    if (verifyResult.ok) {
      options.setMessage('✅ Payment successful! Plan upgraded.');
      setTimeout(() => options.refresh(), 2000);
    } else {
      options.setMessage(`❌ Verification failed: ${verifyResult.reason}`);
    }
  } catch (error) {
    options.setMessage(`❌ Error: ${error}`);
  } finally {
    options.setBusy(false);
  }
}
