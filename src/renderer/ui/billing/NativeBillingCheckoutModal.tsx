import React, { useState } from 'react';
import type { CheckoutOptions, SeatTier, SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import {
  formatInr,
  formatUsd,
  estimateTicketBalancePaymentInr,
  NATIVE_PAYMENT_METHODS,
  subscriptionAmountInr,
  subscriptionCheckoutLabel,
  type NativePaymentMethod,
} from '../../billing/nativeCheckoutModel';

const RAZORPAY_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

type RazorpayCheckoutInstance = { open: () => void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckoutInstance;
  }
}

export type NativeBillingCheckoutIntent =
  | {
      kind: 'subscription';
      tier: Exclude<SubscriptionTierId, 'go'>;
      seatTier?: SeatTier;
      seatCount?: number;
      runtimeIds?: CheckoutOptions['runtimeIds'];
    }
  | {
      kind: 'credits';
      amountUsd: number;
      organizationId?: string;
      title?: string;
    };

type CheckoutState = 'idle' | 'creating' | 'ready' | 'processing' | 'verifying' | 'success' | 'cancelled' | 'failed';

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.58)',
    backdropFilter: 'blur(10px)',
    padding: 20,
  };
}

function modalStyle(): React.CSSProperties {
  return {
    width: 'min(520px, calc(100vw - 40px))',
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    borderRadius: 16,
    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
    background: 'var(--pawos-bg-elevated)',
    color: 'var(--pawos-fg)',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
  };
}

function lineItem(label: string, value: string, strong = false) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13.5, fontWeight: strong ? 700 : 500 }}>
      <span style={{ color: strong ? 'var(--pawos-fg)' : 'var(--pawos-text-secondary)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function statusText(state: CheckoutState, message: string | null): string {
  if (message) return message;
  if (state === 'creating') return 'Creating checkout with the PawOS billing backend...';
  if (state === 'ready') return 'Checkout is ready.';
  if (state === 'processing') return 'Waiting for Razorpay payment authorization...';
  if (state === 'verifying') return 'Verifying payment with the PawOS billing backend...';
  if (state === 'success') return 'Payment verified. PawOS is refreshing your billing state.';
  if (state === 'cancelled') return 'Payment cancelled. Nothing was changed.';
  if (state === 'failed') return 'Payment could not be completed.';
  return '';
}

export function NativeBillingCheckoutModal({
  intent,
  onClose,
  onSuccess,
}: {
  intent: NativeBillingCheckoutIntent;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [state, setState] = useState<CheckoutState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<NativePaymentMethod>('razorpay');

  const isBusy = state === 'creating' || state === 'processing' || state === 'verifying';
  const isSubscription = intent.kind === 'subscription';
  const label = isSubscription
    ? subscriptionCheckoutLabel(intent.tier, intent.seatTier)
    : intent.title ?? 'PawOS Ticket Balance';
  const quantity = isSubscription && (intent.tier === 'team' || intent.tier === 'enterprise') ? Math.max(1, intent.seatCount ?? 1) : 1;
  const subscriptionAmount = isSubscription ? subscriptionAmountInr(intent.tier, intent.seatTier, quantity) : null;
  const subtotal = isSubscription ? (subscriptionAmount ?? 0) : intent.amountUsd;
  const estimatedCreditPaymentInr = !isSubscription ? estimateTicketBalancePaymentInr(intent.amountUsd) : null;
  const totalText = isSubscription ? formatInr(subtotal) : formatInr(estimatedCreditPaymentInr ?? 0);
  const purchaseText = isSubscription ? totalText : formatUsd(intent.amountUsd);
  const billingFrequency = isSubscription ? 'Billed monthly' : 'One-time Ticket Balance top-up';
  const isLargeCreditPurchase = !isSubscription && intent.amountUsd >= 10000;

  async function pay() {
    if (isBusy || state === 'success') return;
    setState('creating');
    setMessage(null);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setState('failed');
        setMessage('Could not load Razorpay. Check your network connection and try again.');
        return;
      }

      if (intent.kind === 'subscription') {
        const checkout = await ipc.billingCreateNativeSubscriptionCheckout(intent.tier, {
          seatTier: intent.seatTier,
          seatCount: intent.seatCount,
          runtimeIds: intent.runtimeIds,
        });
        if (!checkout.ok) {
          setState('failed');
          setMessage(checkout.reason);
          return;
        }
        setState('processing');
        const razorpay = new window.Razorpay({
          key: checkout.keyId,
          subscription_id: checkout.subscriptionId,
          name: 'PawOS',
          description: `${label} subscription`,
          handler: async (payment: { razorpay_subscription_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) => {
            if (!payment.razorpay_payment_id || !payment.razorpay_subscription_id || !payment.razorpay_signature) {
              setState('failed');
              setMessage('Razorpay did not return the fields required for verification.');
              return;
            }
            setState('verifying');
            const verified = await ipc.billingConfirmNativeSubscriptionPayment(
              payment.razorpay_payment_id,
              payment.razorpay_subscription_id,
              payment.razorpay_signature
            );
            if (!verified.ok) {
              setState('failed');
              setMessage(verified.reason);
              return;
            }
            setState('success');
            setMessage('Plan activated after server-side verification.');
            onSuccess?.();
          },
          modal: {
            ondismiss: () => {
              setState('cancelled');
              setMessage('Payment cancelled. No plan change was applied.');
            },
          },
        });
        razorpay.open();
        return;
      }

      const supabase = await getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const checkout = await ipc.billingCreateNativeCreditsCheckout(intent.amountUsd, intent.organizationId, accessToken);
      if (!checkout.ok) {
        setState('failed');
        setMessage(checkout.reason);
        return;
      }
      setState('processing');
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: 'PawOS',
        description: `Add ${formatUsd(checkout.amountUsd)} to Ticket Balance`,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          setState('verifying');
          const verified = await ipc.billingVerifyNativeCreditsPayment({
            accessToken,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            organizationId: intent.organizationId,
          });
          if (!verified.ok) {
            setState('failed');
            setMessage(verified.reason);
            return;
          }
          setState('success');
          setMessage(`${formatUsd(verified.amountUsd)} added after server-side verification.`);
          onSuccess?.();
        },
        modal: {
          ondismiss: () => {
            setState('cancelled');
            setMessage('Payment cancelled. No balance was added.');
          },
        },
      });
      razorpay.open();
    } catch (error) {
      setState('failed');
      setMessage(error instanceof Error ? error.message : 'Checkout failed before payment could be verified.');
    }
  }

  const status = statusText(state, message);

  return (
    <div style={overlayStyle()} role="presentation">
      <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Confirm billing changes">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px 12px' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Confirm plan changes</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close checkout"
            style={{ border: 'none', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 20, cursor: isBusy ? 'default' : 'pointer' }}
          >
            x
          </button>
        </div>
        <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>{billingFrequency}</div>
            {quantity > 1 && <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>Quantity: {quantity}</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 0', borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
            {!isSubscription && lineItem('Purchase', purchaseText)}
            {!isSubscription && lineItem(`FX rate`, `1 USD = INR ${estimatedCreditPaymentInr === null ? '0.00' : (estimatedCreditPaymentInr / intent.amountUsd).toFixed(2)}`)}
            {lineItem(isSubscription ? 'Subtotal' : 'Payment today', totalText)}
            {lineItem('Tax', isSubscription ? formatInr(0) : formatInr(0))}
            {lineItem('Total due today', totalText, true)}
          </div>

          {isLargeCreditPurchase && (
            <div style={{ borderRadius: 10, border: '1px solid rgba(224,194,140,0.35)', background: 'rgba(224,194,140,0.08)', padding: '10px 12px', fontSize: 12.5, color: '#e0c28c' }}>
              {intent.amountUsd >= 20000 ? 'Maximum credit purchase' : 'Large credit purchase'}: verify {formatUsd(intent.amountUsd)} USD and {totalText} before continuing.
            </div>
          )}

          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 9 }}>Payment method</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {NATIVE_PAYMENT_METHODS.map((method) => (
                <label
                  key={method.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '12px 13px',
                    borderRadius: 10,
                    border: paymentMethod === method.id ? '1px solid rgba(var(--pawos-accent-rgb), 0.55)' : '1px solid rgba(var(--pawos-overlay-rgb), 0.12)',
                    background: paymentMethod === method.id ? 'rgba(var(--pawos-accent-rgb), 0.1)' : 'rgba(var(--pawos-overlay-rgb), 0.03)',
                  }}
                >
                  <input
                    type="radio"
                    checked={paymentMethod === method.id}
                    onChange={() => setPaymentMethod(method.id)}
                    disabled={isBusy}
                  />
                  <span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{method.label}</span>
                    <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--pawos-text-secondary)' }}>{method.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {status && (
            <div style={{ fontSize: 12.5, color: state === 'failed' ? '#e08c8c' : state === 'success' ? '#8ce0a8' : 'var(--pawos-text-secondary)' }}>
              {status}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              style={{ padding: '9px 16px', borderRadius: 999, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.16)', background: 'transparent', color: 'var(--pawos-fg)', cursor: isBusy ? 'default' : 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={isBusy || state === 'success'}
              style={{ padding: '9px 18px', borderRadius: 999, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, cursor: isBusy || state === 'success' ? 'default' : 'pointer', opacity: isBusy || state === 'success' ? 0.65 : 1 }}
            >
              {isBusy ? 'Working...' : `Pay ${totalText}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
