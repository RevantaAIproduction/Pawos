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
      setTimeout(() => openRazorpayCheckout(result, options, tier), 100);
    };
    script.onerror = () => {
      options.setMessage('❌ Failed to load Razorpay');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, tier);
  }
}

function openRazorpayCheckout(result: any, options: TierPaymentHandler, tier: SubscriptionTierId) {
  try {
    const razorpayInstance = new (window as any).Razorpay({
      key: result.keyId,
    });

    // Register payment success handler
    razorpayInstance.on('payment.success', (response: any) => {
      handlePaymentSuccess(response, result, options, tier);
    });

    // Register payment error handler
    razorpayInstance.on('payment.error', (error: any) => {
      options.setMessage(`❌ Payment failed: ${error?.message || 'Unknown error'}`);
      options.setBusy(false);
    });

    // Create payment with order details
    const userName = options.userEmail.split('@')[0] || 'Customer';
    const paymentData = {
      order_id: result.orderId,
      amount: result.amountPaise,
      currency: result.currency || 'INR',
      email: options.userEmail,
      contact: '9000000000', // Placeholder phone for Razorpay
      customer_name: userName,
      description: `PawOS ${tier} Tier Purchase`,
      notes: {
        tier,
        productType: 'tier_purchase',
      },
    };

    razorpayInstance.createPayment(paymentData);
  } catch (error) {
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
