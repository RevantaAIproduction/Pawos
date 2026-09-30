import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';

const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface CreditsPaymentHandler {
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
  /** Prefilled on Razorpay's page; falls back to the signed-in session's email. */
  userEmail?: string;
  /** Set for an organization's shared balance; omitted for a personal balance. */
  organizationId?: string;
}

/**
 * One-time Razorpay Order → Razorpay's own Checkout page (`.open()`), which collects the
 * contact number and payment details itself — PawOS shows no form of its own. The payment is
 * credited only after pawos-web verifies the signature (billing:verify*Payment).
 */
export async function initiateRazorpayCreditsPayment(
  amountUsd: number,
  isAutonomous: boolean,
  options: CreditsPaymentHandler
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    if (amountUsd <= 0) {
      options.setMessage('[error] Enter a valid amount');
      options.setBusy(false);
      return;
    }

    const supabase = await getSupabaseClient();
    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token && sessionData.session?.refresh_token) {
      const refreshed = await supabase.auth.refreshSession();
      sessionData = { session: refreshed.data.session };
    }
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      options.setMessage('[error] Your session has expired. Sign in again and retry.');
      options.setBusy(false);
      return;
    }

    // Create order based on credit type
    const createOrderFn = isAutonomous
      ? ipc.billingCreateNativeCreditsCheckout
      : ipc.billingCreateNativeUsageCreditsCheckout;

    const result = await createOrderFn(amountUsd, options.organizationId, accessToken);

    if (!result.ok) {
      options.setMessage(`[error] ${result.reason}`);
      options.setBusy(false);
      return;
    }

    const user = sessionData.session?.user;
    const prefill = {
      email: options.userEmail || user?.email || '',
      name: (user?.user_metadata?.name as string | undefined) || '',
    };

    // Load Razorpay and open checkout
    loadRazorpayAndPay(result, options, isAutonomous, amountUsd, accessToken, prefill);
  } catch (error) {
    options.setMessage(`[error] ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

function loadRazorpayAndPay(result: any, options: CreditsPaymentHandler, isAutonomous: boolean, amountUsd: number, accessToken: string, prefill: { email: string; name: string }) {
  if (!window.Razorpay) {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => openRazorpayCheckout(result, options, isAutonomous, amountUsd, accessToken, prefill);
    script.onerror = () => {
      options.setMessage('[error] Could not load the payment page. Check your internet connection and try again.');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, isAutonomous, amountUsd, accessToken, prefill);
  }
}

function openRazorpayCheckout(result: any, options: CreditsPaymentHandler, isAutonomous: boolean, amountUsd: number, accessToken: string, prefill: { email: string; name: string }) {
  const creditsLabel = isAutonomous ? 'Autonomous Work Credits' : 'Usage Credits';
  const razorpayOptions = {
    key: result.keyId,
    order_id: result.orderId,
    amount: result.amountPaise,
    currency: 'INR',
    name: 'PawOS',
    description: `${creditsLabel} - $${amountUsd}`,
    prefill,
    notes: { product: creditsLabel, amount_usd: String(amountUsd) },
    handler: async (response: any) => {
      await handlePaymentSuccess(response, result, options, isAutonomous, amountUsd, accessToken);
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
    razorpay.on?.('payment.failed', (response: any) => {
      options.setMessage(`[error] ${response?.error?.description || 'Payment failed. Please try again.'}`);
    });
    razorpay.open();
  } catch (error) {
    options.setMessage(`[error] Payment error: ${error instanceof Error ? error.message : String(error)}`);
    options.setBusy(false);
  }
}

async function handlePaymentSuccess(
  response: any,
  result: any,
  options: CreditsPaymentHandler,
  isAutonomous: boolean,
  amountUsd: number,
  accessToken: string
) {
  try {
    const verifyFn = isAutonomous
      ? ipc.billingVerifyNativeCreditsPayment
      : ipc.billingVerifyNativeUsageCreditsPayment;

    // accessToken is required: pawos-web credits the balance of the account it identifies.
    const verifyResult = await verifyFn({
      accessToken,
      orderId: response.razorpay_order_id || result.orderId,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
      organizationId: options.organizationId,
    });

    if (verifyResult.ok) {
      const creditsText = isAutonomous ? 'Autonomous Work Credits' : 'Usage Credits';
      options.setMessage(`Payment successful. $${amountUsd} ${creditsText} added.`);
      options.refresh();
    } else {
      options.setMessage(`[error] Verification failed: ${verifyResult.reason}. If you were charged, contact support with payment ID ${response.razorpay_payment_id}.`);
    }
  } catch (error) {
    options.setMessage(`[error] ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    options.setBusy(false);
  }
}
