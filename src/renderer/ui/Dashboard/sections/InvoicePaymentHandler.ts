// @ts-nocheck
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export interface InvoicePaymentHandler {
  setMessage: (msg: string | null) => void;
  setBusy: (busy: boolean) => void;
  refresh: () => void;
  userEmail: string;
}

const INVOICE_THRESHOLD_INR = 50000; // ₹50,000

export async function initiateRazorpayInvoicePayment(
  amountInr: number,
  description: string,
  options: InvoicePaymentHandler
) {
  try {
    options.setBusy(true);
    options.setMessage(null);

    if (amountInr <= 0) {
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

    if (amountInr >= INVOICE_THRESHOLD_INR) {
      // Use Razorpay Invoice for large amounts
      handleLargeInvoice(amountInr, description, options, accessToken);
    } else {
      // Use Razorpay Checkout (Orders) for smaller amounts
      handleSmallInvoice(amountInr, description, options, accessToken);
    }
  } catch (error) {
    options.setMessage(`❌ ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

async function handleLargeInvoice(
  amountInr: number,
  description: string,
  options: InvoicePaymentHandler,
  accessToken: string
) {
  try {
    // Call backend to create Razorpay invoice
    const result = await ipc.billingCreateInvoice(amountInr, description, options.userEmail, accessToken);

    if (!result.ok) {
      options.setMessage(`❌ ${result.reason}`);
      options.setBusy(false);
      return;
    }

    options.setMessage(`✅ Invoice created! Sent to ${options.userEmail}. Payment link: ${result.invoiceUrl || 'Check email'}`);
    setTimeout(() => options.refresh(), 3000);
    options.setBusy(false);
  } catch (error) {
    options.setMessage(`❌ Invoice creation failed: ${error}`);
    options.setBusy(false);
  }
}

async function handleSmallInvoice(
  amountInr: number,
  description: string,
  options: InvoicePaymentHandler,
  accessToken: string
) {
  try {
    // Create order for checkout
    const amountUsd = amountInr / 95.65;
    const result = await ipc.billingCreateNativeSubscriptionCheckout('pro', {}, accessToken);

    if (!result.ok) {
      options.setMessage(`❌ ${result.reason}`);
      options.setBusy(false);
      return;
    }

    // Load Razorpay and open checkout with all payment methods
    loadRazorpayAndPay(result, options, description, amountInr);
  } catch (error) {
    options.setMessage(`❌ ${error instanceof Error ? error.message : 'Payment failed'}`);
    options.setBusy(false);
  }
}

function loadRazorpayAndPay(result: any, options: InvoicePaymentHandler, description: string, amountInr: number) {
  if (!window.Razorpay) {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
    script.async = true;
    script.onload = () => openRazorpayCheckout(result, options, description, amountInr);
    script.onerror = () => {
      options.setMessage('❌ Failed to load payment');
      options.setBusy(false);
    };
    document.body.appendChild(script);
  } else {
    openRazorpayCheckout(result, options, description, amountInr);
  }
}

function openRazorpayCheckout(result: any, options: InvoicePaymentHandler, description: string, amountInr: number) {
  const razorpayOptions = {
    key: result.keyId,
    order_id: result.orderId,
    amount: Math.round(amountInr * 100), // Convert to paise
    currency: 'INR',
    name: 'PawOS',
    description,
    prefill: {
      email: options.userEmail,
    },
    // Show all payment methods
    method: undefined,
    handler: async (response: any) => {
      await handlePaymentSuccess(response, result, options, description, amountInr);
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
  options: InvoicePaymentHandler,
  description: string,
  amountInr: number
) {
  try {
    // Verify payment
    const verifyResult = await ipc.billingVerifyNativeSubscriptionPayment({
      orderId: result.orderId,
      paymentId: response.razorpay_payment_id,
      signature: response.razorpay_signature,
    });

    if (verifyResult.ok) {
      options.setMessage(`✅ Payment successful! ₹${amountInr.toLocaleString()} received.`);
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
