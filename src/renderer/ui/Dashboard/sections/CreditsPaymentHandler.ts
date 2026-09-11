import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface CreditsPaymentHandler {
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
  userEmail: string;
}

export async function initiateRazorpayCreditsPayment(
  amountUsd: number,
  isAutonomous: boolean,
  options: CreditsPaymentHandler
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    if (amountUsd <= 0) {
      options.setMessage('❌ Enter a valid amount');
      options.setBusy(false);
      return;
    }

    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      options.setMessage('❌ Sign in required');
      options.setBusy(false);
      return;
    }

    // Create order based on credit type
    const createOrderFn = isAutonomous
      ? ipc.billingCreateNativeCreditsCheckout
      : ipc.billingCreateNativeUsageCreditsCheckout;

    const result = await createOrderFn(amountUsd, undefined, accessToken);

    if (!result.ok) {
      options.setMessage(`❌ ${result.reason}`);
      options.setBusy(false);
      return;
    }

    // Load Razorpay and open checkout
    loadRazorpayAndPay(result, options, isAutonomous, amountUsd);
  } catch (error) {
    options.setMessage(`❌ ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

function loadRazorpayAndPay(result: any, options: CreditsPaymentHandler, isAutonomous: boolean, amountUsd: number) {
  if (!window.Razorpay) {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
    script.async = true;
    script.onload = () => openRazorpayCheckout(result, options, isAutonomous, amountUsd);
    script.onerror = () => {
      options.setMessage('❌ Failed to load payment');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, isAutonomous, amountUsd);
  }
}

function openRazorpayCheckout(result: any, options: CreditsPaymentHandler, isAutonomous: boolean, amountUsd: number) {
  const description = isAutonomous ? 'Autonomous Work Credits' : 'Usage Credits';

  const razorpayOptions = {
    key: result.keyId,
    order_id: result.orderId,
    amount: result.amountPaise,
    currency: result.currency || 'INR',
    name: 'PawOS',
    description,
    prefill: {
      email: options.userEmail,
    },
    handler: async (response: any) => {
      await handlePaymentSuccess(response, result, options, isAutonomous, amountUsd);
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
    options.setMessage(`❌ Payment error: ${error}`);
    options.setBusy(false);
  }
}

async function handlePaymentSuccess(
  response: any,
  result: any,
  options: CreditsPaymentHandler,
  isAutonomous: boolean,
  amountUsd: number
) {
  try {
    const verifyFn = isAutonomous
      ? ipc.billingVerifyNativeCreditsPayment
      : ipc.billingVerifyNativeUsageCreditsPayment;

    const verifyResult = await verifyFn({
      orderId: result.orderId,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    });

    if (verifyResult.ok) {
      const creditsText = isAutonomous ? 'Autonomous Work Credits' : 'Usage Credits';
      options.setMessage(`✅ Payment successful! $${amountUsd} ${creditsText} added.`);
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
