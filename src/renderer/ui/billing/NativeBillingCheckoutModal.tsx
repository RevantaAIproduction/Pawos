import React, { useEffect, useMemo, useState } from 'react';
import type { CheckoutOptions, SeatTier, SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import {
  formatInr,
  formatUsd,
  estimateTicketBalancePaymentInr,
  NATIVE_PAYMENT_METHOD_DETAILS,
  subscriptionAmountInr,
  subscriptionCheckoutLabel,
  USAGE_CREDITS_PRESETS_USD,
  USAGE_CREDITS_MIN_USD,
  USAGE_CREDITS_MAX_USD,
  AUTONOMOUS_WORK_CREDITS_PRESETS_USD,
  AUTONOMOUS_WORK_CREDITS_MIN_USD,
  AUTONOMOUS_WORK_CREDITS_MAX_USD,
  type NativePaymentMethod,
} from '../../billing/nativeCheckoutModel';

// Internal: payment processor script — not shown to users
const PAYMENT_PROCESSOR_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

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
      /** Autonomous Work Credits — ticket balance top-up, $30 minimum. Ledger: add_ticket_balance_service. */
      kind: 'autonomousWorkCredits';
      amountUsd: number;
      organizationId?: string;
      title?: string;
    }
  | {
      /** Usage Credits — normal Paw Compute top-up, $5 minimum. Ledger: add_usage_credits_service. */
      kind: 'usageCredits';
      amountUsd?: number;
      organizationId?: string;
      title?: string;
    };

type CheckoutState =
  | 'idle'
  | 'creating'
  | 'processing'
  | 'verifying'
  | 'success'
  | 'cancelled'
  | 'failed';

function loadPaymentScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = PAYMENT_PROCESSOR_SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.62)',
    backdropFilter: 'blur(12px)',
    padding: 20,
  };
}

function modalStyle(): React.CSSProperties {
  return {
    width: 'min(520px, calc(100vw - 40px))',
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    borderRadius: 18,
    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
    background: 'var(--pawos-bg-elevated)',
    color: 'var(--pawos-fg)',
    boxShadow: '0 32px 96px rgba(0,0,0,0.55)',
  };
}

function lineItem(label: string, value: string, strong = false) {
  return (
    <div
      key={label}
      style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13.5, fontWeight: strong ? 700 : 500 }}
    >
      <span style={{ color: strong ? 'var(--pawos-fg)' : 'var(--pawos-text-secondary)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function formatPaymentInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR`;
}

function subscriptionFrequencyText(intent: Extract<NativeBillingCheckoutIntent, { kind: 'subscription' }>): string {
  if (intent.tier === 'pro') return '$20.00 / month';
  if (intent.tier === 'proMax') return '$100.00 / month';
  if (intent.tier === 'team') return intent.seatTier === 'premium' ? '$100.00 / seat / month' : '$20.00 / seat / month';
  if (intent.tier === 'enterprise') return '$20.00 / seat / month (base)';
  return 'Billed monthly';
}

// ─── Preset amount picker ──────────────────────────────────────────────────────

function PresetAmountPicker({
  presets,
  min,
  max,
  selected,
  onSelect,
  disabled,
}: {
  presets: readonly number[];
  min: number;
  max: number;
  selected: number | null;
  onSelect: (v: number) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState('');
  const [customErr, setCustomErr] = useState<string | null>(null);

  function applyCustom() {
    const v = Number.parseFloat(custom);
    if (!Number.isFinite(v) || v < min) {
      setCustomErr(`Minimum is ${formatUsd(min)}.`);
      return;
    }
    if (v > max) {
      setCustomErr(`Maximum is ${formatUsd(max)}.`);
      return;
    }
    setCustomErr(null);
    onSelect(Math.round(v * 100) / 100);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => { setCustom(''); setCustomErr(null); onSelect(p); }}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: selected === p ? '1.5px solid rgba(var(--pawos-accent-rgb), 0.8)' : '1px solid rgba(var(--pawos-overlay-rgb), 0.18)',
              background: selected === p ? 'rgba(var(--pawos-accent-rgb), 0.12)' : 'transparent',
              color: 'var(--pawos-fg)',
              fontWeight: selected === p ? 700 : 500,
              fontSize: 13.5,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {formatUsd(p)}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          min={min}
          max={max}
          step="1"
          placeholder={`Custom (min ${formatUsd(min)})`}
          value={custom}
          disabled={disabled}
          onChange={(e) => { setCustom(e.target.value); setCustomErr(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') applyCustom(); }}
          style={{
            flex: 1,
            borderRadius: 10,
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
            background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
            color: 'var(--pawos-fg)',
            padding: '8px 11px',
            fontSize: 13.5,
          }}
        />
        <button
          type="button"
          disabled={disabled || !custom}
          onClick={applyCustom}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)',
            background: 'transparent',
            color: 'var(--pawos-fg)',
            fontSize: 13,
            cursor: disabled || !custom ? 'default' : 'pointer',
            opacity: disabled || !custom ? 0.5 : 1,
          }}
        >
          Apply
        </button>
      </div>
      {customErr && <div style={{ fontSize: 12, color: '#e08c8c' }}>{customErr}</div>}
      <div style={{ fontSize: 11.5, color: 'var(--pawos-text-secondary)' }}>
        Min {formatUsd(min)} · Max {formatUsd(max)}
      </div>
    </div>
  );
}

// ─── Full-screen Success ────────────────────────────────────────────────────────

function SuccessView({ heading, detail, onClose }: { heading: string; detail: string; onClose: () => void }) {
  return (
    <div style={{ padding: '44px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(100,220,120,0.14)', border: '1.5px solid rgba(100,220,120,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
        ✓
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{heading}</div>
        <div style={{ fontSize: 13.5, color: 'var(--pawos-text-secondary)', maxWidth: 340, lineHeight: 1.5 }}>{detail}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{ marginTop: 8, padding: '10px 28px', borderRadius: 999, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        Done
      </button>
    </div>
  );
}

// ─── Full-screen Failure ────────────────────────────────────────────────────────

function FailureView({ message, onRetry, onClose }: { message: string; onRetry: () => void; onClose: () => void }) {
  return (
    <div style={{ padding: '44px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(220,80,80,0.12)', border: '1.5px solid rgba(220,80,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
        ✕
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Payment could not be completed</div>
        <div style={{ fontSize: 13, color: 'var(--pawos-text-secondary)', maxWidth: 360, lineHeight: 1.55 }}>{message}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={onClose}
          style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 13.5, cursor: 'pointer' }}
        >
          Close
        </button>
        <button
          type="button"
          onClick={onRetry}
          style={{ padding: '9px 20px', borderRadius: 999, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────────

export function NativeBillingCheckoutModal({
  intent,
  onClose,
  onSuccess,
}: {
  intent: NativeBillingCheckoutIntent;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const isSubscription = intent.kind === 'subscription';
  const isCredits = intent.kind === 'autonomousWorkCredits';
  const isUsageCredits = intent.kind === 'usageCredits';

  // For credit kinds with no pre-set amount (usageCredits), user picks here.
  const preSetAmount = isSubscription ? null : (intent as { amountUsd?: number }).amountUsd ?? null;
  const [selectedAmountUsd, setSelectedAmountUsd] = useState<number | null>(preSetAmount);

  const [state, setState] = useState<CheckoutState>('idle');
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<string>('');
  const [availableMethods, setAvailableMethods] = useState<NativePaymentMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsMessage, setMethodsMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<NativePaymentMethod | null>(null);

  const isBusy = state === 'creating' || state === 'processing' || state === 'verifying';

  const label = isSubscription
    ? subscriptionCheckoutLabel(intent.tier, intent.seatTier)
    : (intent as { title?: string }).title ?? (isUsageCredits ? 'PawOS Usage Credits' : 'PawOS Autonomous Work Credits');

  const quantity =
    isSubscription && (intent.tier === 'team' || intent.tier === 'enterprise')
      ? Math.max(1, intent.seatCount ?? 1)
      : 1;

  const subscriptionInr = isSubscription
    ? subscriptionAmountInr(intent.tier, intent.seatTier, quantity)
    : null;

  const effectiveAmountUsd = selectedAmountUsd ?? 0;
  const creditsInr = !isSubscription ? estimateTicketBalancePaymentInr(effectiveAmountUsd) : null;
  const totalInr = isSubscription ? (subscriptionInr ?? 0) : (creditsInr ?? 0);
  const totalText = formatPaymentInr(totalInr);

  const presets = isUsageCredits ? USAGE_CREDITS_PRESETS_USD : AUTONOMOUS_WORK_CREDITS_PRESETS_USD;
  const minAmount = isUsageCredits ? USAGE_CREDITS_MIN_USD : AUTONOMOUS_WORK_CREDITS_MIN_USD;
  const maxAmount = isUsageCredits ? USAGE_CREDITS_MAX_USD : AUTONOMOUS_WORK_CREDITS_MAX_USD;

  const needsAmountSelection = !isSubscription && selectedAmountUsd === null;
  const isLargePurchase = !isSubscription && effectiveAmountUsd >= 10_000;

  const paymentMethods = useMemo(
    () =>
      availableMethods
        .filter((id) => {
          if (isSubscription) return id === 'upi' || id === 'card';
          return true;
        })
        .map((id) => ({ id, ...NATIVE_PAYMENT_METHOD_DETAILS[id] }))
        .filter((m) => Boolean(m.label)),
    [availableMethods, isSubscription]
  );

  const payDisabled =
    isBusy ||
    state === 'success' ||
    methodsLoading ||
    !paymentMethod ||
    needsAmountSelection ||
    (!isSubscription && effectiveAmountUsd < minAmount);

  useEffect(() => {
    let cancelled = false;
    setMethodsLoading(true);
    setMethodsMessage(null);
    void ipc.billingGetNativePaymentMethods().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setAvailableMethods([]);
        setPaymentMethod(null);
        setMethodsMessage(result.reason);
      } else {
        const filtered = result.methods.filter((id) => {
          if (isSubscription) return id === 'upi' || id === 'card';
          return true;
        });
        setAvailableMethods(result.methods);
        setPaymentMethod((cur) => (cur && filtered.includes(cur) ? cur : filtered[0] ?? null));
      }
      setMethodsLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSubscription]);

  function resetToIdle() {
    setState('idle');
    setFailMessage(null);
  }

  async function pay() {
    if (isBusy || state === 'success') return;
    if (!paymentMethod) {
      setState('failed');
      setFailMessage('Select a payment method before continuing.');
      return;
    }
    if (!isSubscription && effectiveAmountUsd < minAmount) {
      setState('failed');
      setFailMessage(`The minimum purchase amount is ${formatUsd(minAmount)}.`);
      return;
    }
    setState('creating');
    setFailMessage(null);
    try {
      const scriptLoaded = await loadPaymentScript();
      if (!scriptLoaded || !window.Razorpay) {
        setState('failed');
        setFailMessage('Could not connect to the secure payment service. Check your internet connection and try again.');
        return;
      }

      // ── Subscription checkout ──────────────────────────────────────────────
      if (isSubscription) {
        const checkout = await ipc.billingCreateNativeSubscriptionCheckout(intent.tier, {
          seatTier: intent.seatTier,
          seatCount: intent.seatCount,
          runtimeIds: intent.runtimeIds,
        });
        if (!checkout.ok) {
          setState('failed');
          setFailMessage(checkout.reason);
          return;
        }
        setState('processing');
        const razorpay = new window.Razorpay({
          key: checkout.keyId,
          subscription_id: checkout.subscriptionId,
          method: paymentMethod,
          prefill: { method: paymentMethod },
          name: 'PawOS',
          description: `${label} subscription`,
          handler: async (payment: {
            razorpay_subscription_id?: string;
            razorpay_payment_id?: string;
            razorpay_signature?: string;
          }) => {
            if (!payment.razorpay_payment_id || !payment.razorpay_subscription_id || !payment.razorpay_signature) {
              setState('failed');
              setFailMessage('The payment processor returned an incomplete response. Contact support if your payment was charged.');
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
              setFailMessage(verified.reason);
              return;
            }
            setSuccessDetail('Your plan is now active. PawOS is refreshing your account.');
            setState('success');
            onSuccess?.();
          },
          modal: {
            ondismiss: () => {
              setState('cancelled');
              setFailMessage('Payment was cancelled. No changes were made to your plan.');
            },
          },
        });
        razorpay.open();
        return;
      }

      // ── Credits checkout — Usage Credits or Autonomous Work Credits ──────────
      // Each routes to a completely separate API endpoint with separate min/max and separate ledger.
      const supabase = await getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const organizationId = (intent as { organizationId?: string }).organizationId;

      // Usage Credits → /api/billing/checkout-usage-credits (productType="usage_credits", $5 min)
      // Autonomous Work Credits → /api/billing/checkout-credits (productType="ticket_balance", $30 min)
      const checkout = await (isUsageCredits
        ? ipc.billingCreateNativeUsageCreditsCheckout(effectiveAmountUsd, organizationId, accessToken)
        : ipc.billingCreateNativeCreditsCheckout(effectiveAmountUsd, organizationId, accessToken)
      );
      if (!checkout.ok) {
        setState('failed');
        setFailMessage(checkout.reason);
        return;
      }
      setState('processing');
      const creditLabel = isUsageCredits
        ? `Add ${formatUsd(checkout.amountUsd)} Usage Credits`
        : `Add ${formatUsd(checkout.amountUsd)} to Autonomous Work Credits`;
      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        method: paymentMethod,
        prefill: { method: paymentMethod },
        name: 'PawOS',
        description: creditLabel,
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setState('verifying');
          // Usage Credits → /api/billing/credit-usage-credits (add_usage_credits_service RPC)
          // Autonomous Work Credits → /api/billing/credit-ticket-balance (add_ticket_balance_service RPC)
          const verified = await (isUsageCredits
            ? ipc.billingVerifyNativeUsageCreditsPayment({
                accessToken,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                organizationId,
              })
            : ipc.billingVerifyNativeCreditsPayment({
                accessToken,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
                organizationId,
              })
          );
          if (!verified.ok) {
            setState('failed');
            setFailMessage(verified.reason);
            return;
          }
          setSuccessDetail(
            `${formatUsd(verified.amountUsd)} has been added to your ${isUsageCredits ? 'Usage Credits' : 'Autonomous Work Credits'} balance.`
          );
          setState('success');
          onSuccess?.();
        },
        modal: {
          ondismiss: () => {
            setState('cancelled');
            setFailMessage('Payment was cancelled. Your balance was not changed.');
          },
        },
      });
      razorpay.open();
    } catch (error) {
      setState('failed');
      setFailMessage(error instanceof Error ? error.message : 'An unexpected error occurred before payment could be processed.');
    }
  }

  // ── Render success / failure full-screen views ────────────────────────────
  if (state === 'success') {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Payment complete">
          <SuccessView
            heading={isSubscription ? `${label} activated` : 'Credits added'}
            detail={successDetail}
            onClose={() => { onSuccess?.(); onClose(); }}
          />
        </div>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Payment failed">
          <FailureView
            message={failMessage ?? 'The payment could not be completed.'}
            onRetry={resetToIdle}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  const isSubscriptionIntent = intent.kind === 'subscription';
  const billingFrequency = isSubscriptionIntent
    ? subscriptionFrequencyText(intent)
    : isUsageCredits
      ? 'One-time Usage Credits top-up'
      : 'One-time Autonomous Work Credits top-up';

  return (
    <div style={overlayStyle()} role="presentation">
      <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="PawOS checkout">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 14px' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            {isSubscription
              ? `Upgrade to ${label.replace('PawOS ', '')}`
              : isUsageCredits
                ? 'Add Usage Credits'
                : 'Add Autonomous Work Credits'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 18, cursor: isBusy ? 'default' : 'pointer', opacity: isBusy ? 0.4 : 1, lineHeight: 1, padding: '2px 6px' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '0 24px 26px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Product label */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
            <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>{billingFrequency}</div>
            {quantity > 1 && (
              <div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>
                {quantity} {quantity === 1 ? 'seat' : 'seats'}
              </div>
            )}
          </div>

          {/* Amount picker — only for credit kinds without a pre-set amount */}
          {!isSubscription && selectedAmountUsd === null && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>Select amount</div>
              <PresetAmountPicker
                presets={presets}
                min={minAmount}
                max={maxAmount}
                selected={selectedAmountUsd}
                onSelect={setSelectedAmountUsd}
                disabled={isBusy}
              />
            </div>
          )}

          {/* If amount was pre-set or just selected, show a "Change" link */}
          {!isSubscription && selectedAmountUsd !== null && !isBusy && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(var(--pawos-overlay-rgb), 0.05)', border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--pawos-text-secondary)' }}>Amount selected</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 1 }}>{formatUsd(selectedAmountUsd)}</div>
              </div>
              {/* Allow changing only when caller didn't pre-set it */}
              {preSetAmount === null && (
                <button
                  type="button"
                  onClick={() => setSelectedAmountUsd(null)}
                  style={{ fontSize: 12.5, color: 'rgba(var(--pawos-accent-rgb), 0.9)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Change
                </button>
              )}
            </div>
          )}

          {/* Order summary — shown once amount is determined */}
          {(!needsAmountSelection || isSubscription) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '14px 0', borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
              {!isSubscription && lineItem('Purchase', formatUsd(effectiveAmountUsd))}
              {!isSubscription && lineItem('Exchange rate', '1 USD = ₹95.65 INR')}
              {lineItem('Charged today', totalText)}
              {lineItem('Tax', '₹0.00 INR')}
              {lineItem('Total', totalText, true)}
            </div>
          )}

          {/* Large purchase warning */}
          {isLargePurchase && (
            <div style={{ borderRadius: 10, border: '1px solid rgba(224,194,140,0.35)', background: 'rgba(224,194,140,0.08)', padding: '10px 13px', fontSize: 12.5, color: '#e0c28c', lineHeight: 1.5 }}>
              Large purchase: please verify {formatUsd(effectiveAmountUsd)} USD ({totalText}) before confirming.
            </div>
          )}

          {/* Payment method selector */}
          {(!needsAmountSelection || isSubscription) && (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Payment method</div>
              <div style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>
                Your payment is processed securely. Available methods are configured by your organization.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {methodsLoading && (
                  <div style={{ fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>Loading payment options...</div>
                )}
                {!methodsLoading && methodsMessage && (
                  <div style={{ fontSize: 12.5, color: '#e08c8c' }}>{methodsMessage}</div>
                )}
                {!methodsLoading && paymentMethods.map((method) => (
                  <label
                    key={method.id}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '12px 13px',
                      borderRadius: 10,
                      cursor: isBusy ? 'default' : 'pointer',
                      border: paymentMethod === method.id
                        ? '1.5px solid rgba(var(--pawos-accent-rgb), 0.6)'
                        : '1px solid rgba(var(--pawos-overlay-rgb), 0.13)',
                      background: paymentMethod === method.id
                        ? 'rgba(var(--pawos-accent-rgb), 0.09)'
                        : 'rgba(var(--pawos-overlay-rgb), 0.03)',
                    }}
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === method.id}
                      onChange={() => setPaymentMethod(method.id)}
                      disabled={isBusy}
                      style={{ marginTop: 2, flexShrink: 0 }}
                    />
                    <span>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{method.label}</span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--pawos-text-secondary)' }}>
                        {method.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Cancelled notice */}
          {state === 'cancelled' && failMessage && (
            <div style={{ fontSize: 12.5, color: 'var(--pawos-text-secondary)', padding: '8px 12px', borderRadius: 8, background: 'rgba(var(--pawos-overlay-rgb), 0.06)' }}>
              {failMessage}
            </div>
          )}

          {/* Status indicator while busy */}
          {isBusy && (
            <div style={{ fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>
              {state === 'creating' && 'Preparing secure checkout...'}
              {state === 'processing' && 'Waiting for payment confirmation...'}
              {state === 'verifying' && 'Verifying payment with our billing backend...'}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              style={{
                padding: '9px 18px',
                borderRadius: 999,
                border: '1px solid rgba(var(--pawos-overlay-rgb), 0.16)',
                background: 'transparent',
                color: 'var(--pawos-fg)',
                fontSize: 13.5,
                cursor: isBusy ? 'default' : 'pointer',
                opacity: isBusy ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={payDisabled}
              style={{
                padding: '9px 20px',
                borderRadius: 999,
                border: 'none',
                background: 'var(--pawos-button-primary-bg)',
                color: 'var(--pawos-button-primary-fg)',
                fontWeight: 700,
                fontSize: 13.5,
                cursor: payDisabled ? 'default' : 'pointer',
                opacity: payDisabled ? 0.55 : 1,
              }}
            >
              {isBusy
                ? 'Processing...'
                : needsAmountSelection
                  ? 'Select an amount to continue'
                  : `Pay ${totalText}`}
            </button>
          </div>

          <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
            {isSubscription
              ? 'Subscription renews automatically each month. Cancel anytime from Settings → Billing.'
              : 'One-time purchase. Charged in Indian Rupees (INR) at the rate shown above.'}
          </div>
        </div>
      </div>
    </div>
  );
}
