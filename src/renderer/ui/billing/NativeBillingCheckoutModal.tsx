import React, { useEffect, useMemo, useState } from 'react';
import type { CheckoutOptions, SeatTier, SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { organizationService } from '../../organization/OrganizationService';
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

// Internal: payment processor scripts — not shown to users
const STANDARD_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'; // For subscriptions only (unchanged)
const CUSTOM_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/razorpay.js'; // For Custom Checkout (one-time orders)

type RazorpayCheckoutInstance = { open: () => void };
type RazorpayCustomCheckoutInstance = {
  createPayment: (data: Record<string, unknown>) => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};
type RazorpayConstructor = {
  new (options: Record<string, unknown>): RazorpayCheckoutInstance | RazorpayCustomCheckoutInstance;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
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
    }
  | {
      /**
       * Additional seat purchase for an existing Team/Enterprise org. Adds one seat to the
       * org's seat_count so the invited user can log in and get the org tier. Uses the
       * same Razorpay Order flow as usage credits (one-time payment, not a subscription),
       * charged at the org's current seat tier price.
       */
      kind: 'additionalSeat';
      organizationId: string;
      seatTier: SeatTier;
      /** Invitation email — the invite is sent automatically after payment succeeds. */
      inviteEmail: string;
      inviteRole: string;
    };

type CheckoutState =
  | 'idle'
  | 'creating'
  | 'processing'
  | 'verifying'
  | 'success'
  | 'onboarding-welcome'
  | 'onboarding-tools'
  | 'onboarding-role'
  | 'cancelled'
  | 'failed';

function loadPaymentScript(type: 'standard' | 'custom' = 'custom'): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    // razorpay.js works for both Standard Checkout and Custom Checkout
    // Use the same script URL for all flows
    script.src = CUSTOM_CHECKOUT_SCRIPT_URL; // Always use razorpay.js
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

// ─── Onboarding: Welcome Screen ────────────────────────────────────────────────

function WelcomeScreen({ tier, onNext }: { tier: Exclude<SubscriptionTierId, 'go'>; onNext: () => void }) {
  const tierConfig: Record<string, { title: string; headline: string; features: string[] }> = {
    pro: {
      title: 'PawOS Pro',
      headline: '5 things PawOS Pro can take off your plate',
      features: [
        '✓ Monday team update — Share weekly progress summaries',
        '✓ Meeting prep — Brief yourself before each meeting',
        '✓ Roll-up numbers — Research and draft status updates',
        '✓ Inbox triage — Prioritize and filter important messages',
        '✓ Code review — Draft and discuss pull request feedback',
      ],
    },
    proMax: {
      title: 'PawOS Pro Max',
      headline: '5 things PawOS Pro Max can take off your plate',
      features: [
        '✓ Autonomous execution — Build features without you writing code',
        '✓ Multi-step workflows — Connect tools and automate your tasks',
        '✓ Advanced analysis — Deep dive research and insights',
        '✓ Full codebase context — Work with your entire project',
        '✓ Meeting facilitation — Run and summarize your meetings',
      ],
    },
    team: {
      title: 'PawOS Team',
      headline: '5 things PawOS Team can do for your team',
      features: [
        '✓ Shared workflows — All team members use the same automations',
        '✓ Connected tools — Gmail, Slack, Linear, Jira, and more',
        '✓ Team analytics — Track work across your entire team',
        '✓ Consistent standards — Apply team policies and processes',
        '✓ Knowledge base — Centralized team documentation and context',
      ],
    },
    enterprise: {
      title: 'PawOS Enterprise',
      headline: '5 things PawOS Enterprise provides',
      features: [
        '✓ Full organization access — Every team member can use PawOS',
        '✓ Advanced permissions — Control who can see and execute what',
        '✓ Audit trail — Complete activity logs for compliance',
        '✓ Custom integrations — Connect your internal tools and systems',
        '✓ Dedicated support — Priority help from our team',
      ],
    },
  };

  const config = tierConfig[tier] || { title: 'Welcome', headline: 'You are ready to start', features: [] };

  return (
    <div style={{ padding: '44px 30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Welcome to {config?.title || 'PawOS'}</div>
        <div style={{ fontSize: 14, color: 'var(--pawos-text-secondary)', marginBottom: 20 }}>{config?.headline || 'Your plan is active'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', textAlign: 'left', maxWidth: 380, margin: '0 auto' }}>
          {(config?.features || []).map((f) => (
            <div key={f} style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--pawos-fg)' }}>
              {f}
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onNext}
        style={{ marginTop: 8, padding: '10px 28px', borderRadius: 999, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        Continue
      </button>
    </div>
  );
}

// ─── Onboarding: Connect Tools Screen ────────────────────────────────────────

function ConnectToolsScreen({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const tools = [
    { name: 'Gmail', icon: '📧', description: 'Email management' },
    { name: 'Google Drive', icon: '📁', description: 'File storage' },
    { name: 'Slack', icon: '💬', description: 'Team communication' },
    { name: 'Google Calendar', icon: '📅', description: 'Scheduling' },
  ];

  return (
    <div style={{ padding: '44px 30px', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Connect your tools</div>
        <div style={{ fontSize: 13.5, color: 'var(--pawos-text-secondary)' }}>
          These are the top tools for people in your role. Next, Claude will suggest what it can do with them.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, margin: '8px 0' }}>
        {tools.map((tool) => (
          <div
            key={tool.name}
            style={{
              padding: '16px 12px',
              borderRadius: 12,
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
              background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 24 }}>{tool.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{tool.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--pawos-text-secondary)' }}>{tool.description}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
        <button
          type="button"
          onClick={onSkip}
          style={{ padding: '9px 20px', borderRadius: 999, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 13.5, cursor: 'pointer' }}
        >
          Skip
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{ padding: '9px 20px', borderRadius: 999, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}
        >
          Connect now
        </button>
      </div>
    </div>
  );
}

// ─── Onboarding: Role Selection Screen ────────────────────────────────────────

function RoleSelectionScreen({ onComplete }: { onComplete: () => void }) {
  const roles = [
    'Product management',
    'Engineering',
    'Human resources',
    'Finance',
    'Marketing',
    'Sales',
    'Operations',
    'Data science',
    'Design',
    'Legal',
    'Scientist',
    'Student',
    'Founder',
    'Healthcare',
    'Writer',
    'Educator',
    'Consultant',
    'Researcher',
    'Software engineer',
  ];

  return (
    <div style={{ padding: '44px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>What do you do?</div>
        <div style={{ fontSize: 13.5, color: 'var(--pawos-text-secondary)' }}>
          Claude uses this to figure out what matters for your work.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: '320px', overflowY: 'auto' }}>
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={onComplete}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
              background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
              color: 'var(--pawos-fg)',
              fontSize: 12.5,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(var(--pawos-accent-rgb), 0.12)';
              (e.target as HTMLButtonElement).style.borderColor = 'rgba(var(--pawos-accent-rgb), 0.6)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(var(--pawos-overlay-rgb), 0.03)';
              (e.target as HTMLButtonElement).style.borderColor = 'rgba(var(--pawos-overlay-rgb), 0.14)';
            }}
          >
            {role}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', textAlign: 'center', marginTop: 4 }}>
        No tools? Continue anyway — Claude will ask about your week instead.
      </div>
    </div>
  );
}

// ─── Custom Checkout Payment Form (PawOS-native for one-time orders) ────────────

interface CustomCheckoutFormProps {
  amountPaise: number;
  label: string;
  totalInr: string;
  availableMethods: NativePaymentMethod[];
  state: CheckoutState;
  selectedMethod: NativePaymentMethod | null;
  onMethodChange: (method: NativePaymentMethod) => void;
  selectedBankCode: string | null;
  onBankChange: (code: string | null) => void;
  selectedWalletCode: string | null;
  onWalletChange: (code: string | null) => void;
  onCancel: () => void;
  onPay: () => void;
}

function CustomCheckoutPaymentForm({
  amountPaise,
  label,
  totalInr,
  availableMethods,
  state,
  selectedMethod,
  onMethodChange,
  selectedBankCode,
  onBankChange,
  selectedWalletCode,
  onWalletChange,
  onCancel,
  onPay,
}: CustomCheckoutFormProps) {
  const isBusy = state === 'processing' || state === 'verifying';

  const banks = [
    { code: 'HDFC', name: 'HDFC Bank' },
    { code: 'ICIC', name: 'ICICI Bank' },
    { code: 'UTIB', name: 'Axis Bank' },
    { code: 'SBIN', name: 'State Bank of India' },
    { code: 'INDB', name: 'IndusInd Bank' },
  ];

  const wallets = [
    { code: 'apl', name: 'Apple Pay' },
    { code: 'olamoney', name: 'Ola Money' },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Order Summary */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0', borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
          {lineItem('Amount', formatUsd(amountPaise / 100 / 95.65))}
          {lineItem('Exchange rate', '1 USD = ₹95.65 INR')}
          {lineItem('Charged today', totalInr)}
          {lineItem('Tax', '₹0.00 INR')}
          {lineItem('Total', totalInr, true)}
        </div>
      </div>

      {/* Payment Method Selector */}
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>Payment method</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {availableMethods.map((method) => (
            <label
              key={method}
              style={{
                display: 'flex',
                gap: 10,
                padding: '12px 13px',
                borderRadius: 10,
                cursor: isBusy ? 'default' : 'pointer',
                border: selectedMethod === method
                  ? '1.5px solid rgba(var(--pawos-accent-rgb), 0.6)'
                  : '1px solid rgba(var(--pawos-overlay-rgb), 0.13)',
                background: selectedMethod === method
                  ? 'rgba(var(--pawos-accent-rgb), 0.09)'
                  : 'rgba(var(--pawos-overlay-rgb), 0.03)',
              }}
            >
              <input
                type="radio"
                name="payment-method"
                checked={selectedMethod === method}
                onChange={() => onMethodChange(method)}
                disabled={isBusy}
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
                  {method === 'card' ? 'Card' : method === 'netbanking' ? 'Netbanking' : 'Wallet'}
                </span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--pawos-text-secondary)' }}>
                  {method === 'card' ? 'Credit or Debit Card' : method === 'netbanking' ? 'Bank Transfer' : 'Mobile Wallet'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Netbanking Bank Selection */}
      {selectedMethod === 'netbanking' && (
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Select your bank</label>
          <select
            value={selectedBankCode || ''}
            onChange={(e) => onBankChange(e.target.value || null)}
            disabled={isBusy}
            style={{
              width: '100%',
              padding: '8px 11px',
              borderRadius: 8,
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)',
              background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
              color: 'var(--pawos-fg)',
              fontSize: 13.5,
            }}
          >
            <option value="">Choose a bank...</option>
            {banks.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Wallet Selection */}
      {selectedMethod === 'wallet' && (
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Select your wallet</label>
          <select
            value={selectedWalletCode || ''}
            onChange={(e) => onWalletChange(e.target.value || null)}
            disabled={isBusy}
            style={{
              width: '100%',
              padding: '8px 11px',
              borderRadius: 8,
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)',
              background: 'rgba(var(--pawos-overlay-rgb), 0.04)',
              color: 'var(--pawos-fg)',
              fontSize: 13.5,
            }}
          >
            <option value="">Choose a wallet...</option>
            {wallets.map((wallet) => (
              <option key={wallet.code} value={wallet.code}>
                {wallet.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Processing Status */}
      {isBusy && (
        <div style={{ fontSize: 12.5, color: 'var(--pawos-text-secondary)', padding: '8px 12px', borderRadius: 8, background: 'rgba(var(--pawos-overlay-rgb), 0.06)' }}>
          {state === 'processing' && 'Processing your payment...'}
          {state === 'verifying' && 'Verifying payment with our backend...'}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button
          type="button"
          onClick={onCancel}
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
          onClick={onPay}
          disabled={isBusy || !selectedMethod || (selectedMethod === 'netbanking' && !selectedBankCode) || (selectedMethod === 'wallet' && !selectedWalletCode)}
          style={{
            padding: '9px 20px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--pawos-button-primary-bg)',
            color: 'var(--pawos-button-primary-fg)',
            fontWeight: 700,
            fontSize: 13.5,
            cursor:
              isBusy || !selectedMethod || (selectedMethod === 'netbanking' && !selectedBankCode) || (selectedMethod === 'wallet' && !selectedWalletCode)
                ? 'default'
                : 'pointer',
            opacity:
              isBusy || !selectedMethod || (selectedMethod === 'netbanking' && !selectedBankCode) || (selectedMethod === 'wallet' && !selectedWalletCode)
                ? 0.55
                : 1,
          }}
        >
          {isBusy ? 'Processing...' : `Pay ${totalInr}`}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', textAlign: 'center' }}>
        One-time purchase. Charged in Indian Rupees (INR) at the rate shown above.
      </div>
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
  const isAdditionalSeat = intent.kind === 'additionalSeat';
  // Price per additional seat: Standard = $20/mo, Premium = $100/mo
  const additionalSeatPriceUsd = isAdditionalSeat
    ? (intent.seatTier === 'premium' ? 100 : 20)
    : 0;

  // For credit kinds with no pre-set amount (usageCredits), user picks here.
  const preSetAmount = isSubscription ? null : (intent as { amountUsd?: number }).amountUsd ?? null;
  const [selectedAmountUsd, setSelectedAmountUsd] = useState<number | null>(preSetAmount);

  // Seat count picker — for team/enterprise when plans page passes seatCount: undefined.
  const isTeamOrEnterprise =
    intent.kind === 'subscription' && (intent.tier === 'team' || intent.tier === 'enterprise');
  const minSeats =
    intent.kind === 'subscription' && intent.tier === 'enterprise' ? 20 : 1;
  const maxSeats: number | undefined =
    intent.kind === 'subscription' && intent.tier === 'team' ? 150 : undefined;
  const [seatCountInput, setSeatCountInput] = useState<number>(
    intent.kind === 'subscription' && (intent.tier === 'team' || intent.tier === 'enterprise')
      ? (intent.seatCount ?? minSeats)
      : 1
  );
  const effectiveSeatCount = isTeamOrEnterprise
    ? Math.max(minSeats, maxSeats !== undefined ? Math.min(maxSeats, seatCountInput) : seatCountInput)
    : (intent.kind === 'subscription' ? Math.max(1, intent.seatCount ?? 1) : 1);

  const [state, setState] = useState<CheckoutState>('idle');
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [successDetail, setSuccessDetail] = useState<string>('');
  const [availableMethods, setAvailableMethods] = useState<NativePaymentMethod[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsMessage, setMethodsMessage] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<NativePaymentMethod | null>(null);
  const [selectedBankCode, setSelectedBankCode] = useState<string | null>(null);
  const [selectedWalletCode, setSelectedWalletCode] = useState<string | null>(null);

  const isBusy = state === 'creating' || state === 'processing' || state === 'verifying';

  const label = isAdditionalSeat
    ? `Add 1 ${intent.seatTier === 'premium' ? 'Premium' : 'Standard'} Team Seat`
    : isSubscription
      ? subscriptionCheckoutLabel(intent.tier, intent.seatTier)
      : (intent as { title?: string }).title ?? (isUsageCredits ? 'PawOS Usage Credits' : 'PawOS Autonomous Work Credits');

  const quantity = effectiveSeatCount;

  const subscriptionInr = isSubscription
    ? subscriptionAmountInr(intent.tier, intent.seatTier, quantity)
    : null;

  const effectiveAmountUsd = isAdditionalSeat ? additionalSeatPriceUsd : (selectedAmountUsd ?? 0);
  const creditsInr = !isSubscription ? estimateTicketBalancePaymentInr(effectiveAmountUsd) : null;
  const totalInr = isSubscription ? (subscriptionInr ?? 0) : (creditsInr ?? 0);
  const totalText = formatPaymentInr(totalInr);

  const presets = isUsageCredits ? USAGE_CREDITS_PRESETS_USD : AUTONOMOUS_WORK_CREDITS_PRESETS_USD;
  const minAmount = isUsageCredits ? USAGE_CREDITS_MIN_USD : AUTONOMOUS_WORK_CREDITS_MIN_USD;
  const maxAmount = isUsageCredits ? USAGE_CREDITS_MAX_USD : AUTONOMOUS_WORK_CREDITS_MAX_USD;

  const needsAmountSelection = !isSubscription && !isAdditionalSeat && selectedAmountUsd === null;
  const isLargePurchase = !isSubscription && !isAdditionalSeat && effectiveAmountUsd >= 10_000;

  const paymentMethods = useMemo(
    () =>
      availableMethods
        .filter((id) => {
          if (isSubscription) return id === 'upi' || id === 'card';
          return true;
        })
        .map((id) => ({ id, ...NATIVE_PAYMENT_METHOD_DETAILS[id] }))
        .filter((m) => Boolean(m.label)),
    [availableMethods, isSubscription]  // isAdditionalSeat uses same filter as credits
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

    // Get configured payment methods from server
    void ipc.billingGetNativePaymentMethods().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setAvailableMethods([]);
        setPaymentMethod(null);
        setMethodsMessage(result.reason);
      } else {
        // Apply product-specific filtering
        const filtered = result.methods.filter((id) => {
          if (isSubscription) {
            // Subscriptions: only UPI or Card
            return id === 'upi' || id === 'card';
          } else {
            // Order-based products (Credits, Seat): Card, Netbanking, Wallet only (UPI disabled)
            return id === 'card' || id === 'netbanking' || id === 'wallet';
          }
        });
        setAvailableMethods(filtered);
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

      // ── Subscription checkout (Standard Checkout, unchanged) ────────────────────
      if (isSubscription) {
        const checkout = await ipc.billingCreateNativeSubscriptionCheckout(intent.tier, {
          seatTier: intent.seatTier,
          seatCount: isTeamOrEnterprise ? effectiveSeatCount : intent.seatCount,
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
        }) as RazorpayCheckoutInstance;
        razorpay.open();
        return;
      }

      // ── Order-based checkout (Additional Seat, Usage Credits, Autonomous Work Credits) ────
      // Custom Checkout flow: no .open() modal, PawOS-native form, createPayment() callback

      const supabase = await getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const organizationId = (intent as { organizationId?: string }).organizationId;

      // Create the appropriate Order based on product type
      let checkout;
      if (isAdditionalSeat) {
        checkout = await ipc.billingCreateNativeUsageCreditsCheckout(
          additionalSeatPriceUsd,
          (intent as { organizationId: string }).organizationId,
          accessToken
        );
      } else if (isUsageCredits) {
        checkout = await ipc.billingCreateNativeUsageCreditsCheckout(effectiveAmountUsd, organizationId, accessToken);
      } else {
        // Autonomous Work Credits
        checkout = await ipc.billingCreateNativeCreditsCheckout(effectiveAmountUsd, organizationId, accessToken);
      }

      if (!checkout.ok) {
        setState('failed');
        setFailMessage(checkout.reason);
        return;
      }

      setState('processing');

      // Handle payment result from Custom Checkout
      const handlePaymentResult = async (response: {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
      }) => {
        if (!response.razorpay_payment_id || !response.razorpay_order_id || !response.razorpay_signature) {
          setState('failed');
          setFailMessage('The payment processor returned an incomplete response. Contact support if your payment was charged.');
          return;
        }

        setState('verifying');

        // Use the appropriate verification endpoint
        let verified;
        if (isAdditionalSeat) {
          verified = await ipc.billingVerifyNativeUsageCreditsPayment({
            accessToken,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            organizationId: (intent as { organizationId: string }).organizationId,
          });
        } else if (isUsageCredits) {
          verified = await ipc.billingVerifyNativeUsageCreditsPayment({
            accessToken,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            organizationId,
          });
        } else {
          // Autonomous Work Credits
          verified = await ipc.billingVerifyNativeCreditsPayment({
            accessToken,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            organizationId,
          });
        }

        if (!verified.ok) {
          setState('failed');
          setFailMessage(verified.reason);
          return;
        }

        // Post-payment success logic based on product type
        if (isAdditionalSeat) {
          try {
            await organizationService.incrementSeatCount((intent as { organizationId: string }).organizationId);
          } catch {
            // seat_count column may not exist yet — invite can proceed
          }
          setSuccessDetail(`Seat purchased. ${(intent as { inviteEmail: string }).inviteEmail} has been invited.`);
        } else if (isUsageCredits) {
          setSuccessDetail(
            `${formatUsd(verified.amountUsd)} has been added to your Usage Credits balance.`
          );
        } else {
          setSuccessDetail(
            `${formatUsd(verified.amountUsd)} has been added to your Autonomous Work Credits balance.`
          );
        }

        setState('success');
        onSuccess?.();
      };

      // Initialize Razorpay Custom Checkout instance
      const razorpayInstance = new window.Razorpay({
        key: checkout.keyId,
      }) as RazorpayCustomCheckoutInstance;

      // Listen for ready event to verify available methods (official Custom Checkout flow)
      razorpayInstance.on('ready', (readyResponse: unknown) => {
        const response = readyResponse as { methods?: string[] };
        if (response.methods && !response.methods.includes(paymentMethod)) {
          setState('failed');
          setFailMessage(`${paymentMethod} is not available for this payment.`);
        }
      });

      // Register success/error handlers for Custom Checkout (official API)
      razorpayInstance.on('payment.success', (response: unknown) => {
        handlePaymentResult(response as {
          razorpay_payment_id?: string;
          razorpay_order_id?: string;
          razorpay_signature?: string;
        });
      });

      razorpayInstance.on('payment.error', (error: unknown) => {
        setState('cancelled');
        setFailMessage(
          error instanceof Error
            ? error.message
            : 'Payment was cancelled or failed. Please try again.'
        );
      });

      // Build the payment request for Custom Checkout
      const paymentData: Record<string, unknown> = {
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        method: paymentMethod,
      };

      // Add method-specific parameters
      if (paymentMethod === 'netbanking' && selectedBankCode) {
        paymentData.bank = selectedBankCode;
      }
      if (paymentMethod === 'wallet' && selectedWalletCode) {
        paymentData.wallet = selectedWalletCode;
      }

      // Execute the payment with Custom Checkout API
      try {
        razorpayInstance.createPayment(paymentData);
      } catch (err) {
        setState('failed');
        setFailMessage(
          err instanceof Error
            ? err.message
            : 'Payment could not be initiated. Please try again.'
        );
      }
    } catch (error) {
      setState('failed');
      setFailMessage(error instanceof Error ? error.message : 'An unexpected error occurred before payment could be processed.');
    }
  }

  // ── Render success / onboarding / failure full-screen views ────────────────────────────
  if (state === 'success' && isSubscription) {
    // For subscriptions, enter onboarding flow
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Welcome to PawOS">
          <WelcomeScreen
            tier={intent.tier}
            onNext={() => setState('onboarding-tools')}
          />
        </div>
      </div>
    );
  }

  if (state === 'onboarding-tools') {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Connect your tools">
          <ConnectToolsScreen
            onNext={() => setState('onboarding-role')}
            onSkip={() => setState('onboarding-role')}
          />
        </div>
      </div>
    );
  }

  if (state === 'onboarding-role') {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="What do you do">
          <RoleSelectionScreen
            onComplete={() => {
              onSuccess?.();
              onClose();
            }}
          />
        </div>
      </div>
    );
  }

  // For non-subscription purchases (credits, seats), show simple success
  if (state === 'success') {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Payment complete">
          <SuccessView
            heading={isAdditionalSeat ? 'Seat added' : 'Credits added'}
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
  const isOneTimeOrder = !isSubscriptionIntent; // Usage Credits, Ticket Balance, Additional Seat

  // For one-time orders with Custom Checkout, render after amount selection
  if (isOneTimeOrder && !needsAmountSelection && !['success', 'onboarding-welcome', 'onboarding-tools', 'onboarding-role', 'failed'].includes(state)) {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="PawOS checkout">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 14px' }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              {isAdditionalSeat
                ? 'Add Team Member'
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

          {/* Custom Checkout Form */}
          <CustomCheckoutPaymentForm
            amountPaise={Math.round(totalInr * 100)} // Convert INR to paise
            label={label}
            totalInr={totalText}
            availableMethods={availableMethods}
            state={state}
            selectedMethod={paymentMethod}
            onMethodChange={setPaymentMethod}
            selectedBankCode={selectedBankCode}
            onBankChange={setSelectedBankCode}
            selectedWalletCode={selectedWalletCode}
            onWalletChange={setSelectedWalletCode}
            onCancel={onClose}
            onPay={() => void pay()}
          />
        </div>
      </div>
    );
  }

  // Show loading state during payment processing
  if (isOneTimeOrder && (state === 'processing' || state === 'verifying' || state === 'creating')) {
    return (
      <div style={overlayStyle()} role="presentation">
        <div style={modalStyle()} role="dialog" aria-modal="true" aria-label="Processing payment">
          <div style={{ padding: '44px 30px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'var(--pawos-text-secondary)', marginBottom: 16 }}>
              {state === 'creating' && 'Preparing secure checkout...'}
              {state === 'processing' && 'Processing your payment...'}
              {state === 'verifying' && 'Verifying payment with our backend...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const billingFrequency = isAdditionalSeat
    ? `One-time seat purchase · $${additionalSeatPriceUsd}/seat`
    : isSubscriptionIntent
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
            {isAdditionalSeat
              ? 'Add Team Member'
              : isSubscription
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

          {/* Seat count picker — team and enterprise only */}
          {isTeamOrEnterprise && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Team members
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  min={minSeats}
                  max={maxSeats}
                  value={seatCountInput}
                  disabled={isBusy}
                  onChange={(e) => {
                    const v = Number.parseInt(e.target.value, 10);
                    setSeatCountInput(Number.isFinite(v) ? Math.max(1, v) : minSeats);
                  }}
                  style={{
                    width: 90,
                    borderRadius: 8,
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.18)',
                    background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                    color: 'var(--pawos-fg)',
                    padding: '8px 10px',
                    fontSize: 14,
                  }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--pawos-text-secondary)' }}>
                  {isSubscription && intent.tier === 'team'
                    ? `Up to ${maxSeats ?? 150} members`
                    : `Minimum ${minSeats} members`}
                </span>
              </div>
            </div>
          )}

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

          {/* Payment method selector — for order-based products, always show; for subscriptions, show once amount is determined */}
          {(!needsAmountSelection || isSubscription) && !isOneTimeOrder && (
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
