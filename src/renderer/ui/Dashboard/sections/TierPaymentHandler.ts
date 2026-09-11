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
  if (!(window as any).Razorpay) {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
    script.async = true;
    script.onload = () => {
      // Wait for Razorpay to be available
      setTimeout(() => {
        if ((window as any).Razorpay) {
          openRazorpayCheckout(result, options, tier);
        } else {
          options.setMessage('❌ Payment system failed to initialize');
          options.setBusy(false);
        }
      }, 500);
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
    const Razorpay = (window as any).Razorpay;
    if (!Razorpay) {
      options.setMessage('❌ Payment system unavailable');
      options.setBusy(false);
      return;
    }

    console.log('Creating Razorpay custom checkout...');
    const checkout = new Razorpay(razorpayOptions);

    // Mount checkout to DOM
    if (typeof checkout.mount !== 'function') {
      options.setMessage('❌ Payment initialization failed');
      options.setBusy(false);
      return;
    }

    // Create container for checkout
    const container = document.createElement('div');
    container.id = 'razorpay-checkout-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.zIndex = '9999';
    container.style.backgroundColor = 'white';
    document.body.appendChild(container);

    console.log('Mounting Razorpay checkout...');
    try {
      checkout.mount(container);
      console.log('Razorpay checkout mounted successfully');

      // Listen for events
      if (typeof checkout.on === 'function') {
        checkout.on('payment.failed', (err: any) => {
          console.log('Payment failed:', err);
          options.setMessage(`❌ Payment failed: ${err?.message || 'Unknown error'}`);
        });
        checkout.on('payment.success', (response: any) => {
          console.log('Payment success:', response);
          handlePaymentSuccess(response, result, options, tier);
        });
      }
    } catch (mountError) {
      console.log('Mount error:', mountError);
      options.setMessage(`❌ Checkout mount failed: ${mountError instanceof Error ? mountError.message : String(mountError)}`);
      options.setBusy(false);
      // Clean up container
      document.body.removeChild(container);
    }
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
