// @ts-nocheck
import React, { useEffect, useState } from 'react';
import type { SubscriptionTierId, ProMaxVariant, CheckoutOptions } from '../../../shared/billing/BillingTypes';
import { initiateRazorpayTierPayment } from '../Dashboard/sections/TierPaymentHandler';
import { getSupabaseClient } from '../../auth/supabaseClient';

type Props = {
  tier: SubscriptionTierId;
  options?: CheckoutOptions;
  onClose: () => void;
  onSuccess?: () => void;
};

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Go',
  pro: 'Pro',
  proMax: 'Pro Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

export function TierCheckoutPage({ tier, options, onClose, onSuccess }: Props) {
  const [proMaxVariant, setProMaxVariant] = useState<ProMaxVariant>('5x');
  const [proBillingFrequency, setProBillingFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const getEmail = async () => {
      const supabase = await getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      setUserEmail(sessionData.session?.user?.email || '');
    };
    getEmail();
  }, []);

  const handlePay = async () => {
    const paymentOptions: any = {};
    if (tier === 'proMax') paymentOptions.proMaxVariant = proMaxVariant;
    if (tier === 'pro') paymentOptions.proBillingFrequency = proBillingFrequency;

    await initiateRazorpayTierPayment(tier, { setMessage, setBusy, refresh: onSuccess || (() => {}), userEmail }, paymentOptions);
  };

  // Calculate amounts
  const amountInr =
    tier === 'pro' ? (proBillingFrequency === 'monthly' ? 1913 : 19053) :
    tier === 'proMax' && proMaxVariant === '5x' ? 9565 :
    tier === 'proMax' && proMaxVariant === '20x' ? 23913 :
    0;

  const amountUsd = Math.round((amountInr / 95.65) * 100) / 100;
  const label = TIER_LABELS[tier];

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--pawos-bg)', color: 'var(--pawos-fg)', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ height: 60, borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', paddingLeft: 24, paddingRight: 24, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{ border: 'none', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 20, cursor: busy ? 'default' : 'pointer', padding: 0, marginRight: 12 }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Checkout - {label}</h1>
      </div>

      {/* Two Column Layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left - Plan Selection */}
        <div style={{ flex: 1, overflow: 'auto', padding: '40px 60px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>Plan Details</div>

            {/* Pro billing frequency selector */}
            {tier === 'pro' && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                <button
                  onClick={() => setProBillingFrequency('monthly')}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: proBillingFrequency === 'monthly' ? '2px solid #1967D2' : '1px solid rgba(255,255,255,0.12)',
                    background: proBillingFrequency === 'monthly' ? 'rgba(25,103,210,0.1)' : 'rgba(255,255,255,0.04)',
                    color: 'var(--pawos-fg)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  <div>Pro Monthly</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>${(1913 / 95.65).toFixed(2)}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Billed monthly</div>
                </button>

                <button
                  onClick={() => setProBillingFrequency('yearly')}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: proBillingFrequency === 'yearly' ? '2px solid #1967D2' : '1px solid rgba(255,255,255,0.12)',
                    background: proBillingFrequency === 'yearly' ? 'rgba(25,103,210,0.1)' : 'rgba(255,255,255,0.04)',
                    color: 'var(--pawos-fg)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', top: 8, right: 8, background: '#1967D2', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Save 17%</div>
                  <div>Pro Annual</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>${(19053 / 95.65).toFixed(2)}</div>
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Billed yearly</div>
                </button>
              </div>
            )}

            {/* ProMax variant selector */}
            {tier === 'proMax' && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                {(['5x', '20x'] as const).map((variant) => (
                  <button
                    key={variant}
                    onClick={() => setProMaxVariant(variant)}
                    disabled={busy}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      borderRadius: 8,
                      border: proMaxVariant === variant ? '2px solid #1967D2' : '1px solid rgba(255,255,255,0.12)',
                      background: proMaxVariant === variant ? 'rgba(25,103,210,0.1)' : 'rgba(255,255,255,0.04)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      opacity: busy ? 0.5 : 1,
                      position: 'relative',
                    }}
                  >
                    {variant === '20x' && <div style={{ position: 'absolute', top: 8, right: 8, background: '#1967D2', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Best Value</div>}
                    <div>Pro Max {variant}</div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{variant === '5x' ? '5x more' : '20x more'} than Pro</div>
                    <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>${variant === '5x' ? (9565 / 95.65).toFixed(2) : (23913 / 95.65).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right - Order Summary */}
        <div style={{ flex: 1, overflow: 'auto', padding: '40px 60px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Order Summary</div>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 20, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
              {/* Plan description */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ opacity: 0.7 }}>
                  {label}
                  {tier === 'pro' && (proBillingFrequency === 'monthly' ? ' Monthly' : ' Annual')}
                  {tier === 'proMax' && ` ${proMaxVariant}`}
                </div>
                <div style={{ fontWeight: 600 }}>₹{amountInr.toLocaleString()}</div>
              </div>

              {/* Subtotal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ opacity: 0.7 }}>Subtotal</div>
                <div style={{ fontWeight: 600 }}>₹{amountInr.toLocaleString()}</div>
              </div>

              {/* Tax */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ opacity: 0.7 }}>GST (0%)</div>
                <div style={{ fontWeight: 600, color: '#4cb050' }}>Free</div>
              </div>

              {/* Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, fontWeight: 700 }}>
                <div>Total Due Today</div>
                <div>₹{amountInr.toLocaleString()}</div>
              </div>

              {/* USD conversion */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12, opacity: 0.6 }}>
                ≈ ${amountUsd.toFixed(2)} USD @ ₹95.65/USD
              </div>
            </div>

            {/* Info */}
            <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.6 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div>ℹ️</div>
                <div>One-time payment. No recurring charges.</div>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div>
            {message && (
              <div style={{
                fontSize: 12,
                color: message.includes('❌') ? '#ef4444' : '#4cb050',
                marginBottom: 16,
                padding: '12px 14px',
                background: message.includes('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(76,176,80,0.1)',
                borderRadius: 8,
              }}>
                {message}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={busy}
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 8,
                border: 'none',
                background: busy ? '#606060' : '#1967D2',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
                marginBottom: 12,
              }}
            >
              {busy ? 'Processing...' : `Pay ₹${amountInr.toLocaleString()}`}
            </button>

            <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>
              By completing this purchase, you agree to our terms.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
