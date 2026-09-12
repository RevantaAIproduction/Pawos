import React, { useState } from 'react';
import { initiateRazorpayTierPayment } from './TierPaymentHandler';
import type { SubscriptionTierId, ProMaxVariant } from '../../../../shared/billing/BillingTypes';

interface TierPurchasePanelProps {
  currentTier: SubscriptionTierId;
  userEmail: string;
  onPaymentComplete: () => void;
}

export function TierPurchasePanel({ currentTier, userEmail, onPaymentComplete }: TierPurchasePanelProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTierId | null>(null);
  const [proMaxVariant, setProMaxVariant] = useState<ProMaxVariant>('5x');
  const [proBillingFreq, setProBillingFreq] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleTierPayment = async (tier: SubscriptionTierId) => {
    const options = {
      setMessage,
      setBusy,
      refresh: onPaymentComplete,
      userEmail,
    };

    const paymentOptions: any = {};
    if (tier === 'proMax') paymentOptions.proMaxVariant = proMaxVariant;
    if (tier === 'pro') paymentOptions.proBillingFrequency = proBillingFreq;

    await initiateRazorpayTierPayment(tier, options, paymentOptions);
  };

  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Upgrade Plan</h3>

      {selectedTier === 'pro' && (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.9em', marginBottom: 8 }}>Billing Frequency</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setProBillingFreq('monthly')}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: proBillingFreq === 'monthly' ? '#1967D2' : '#404040',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Monthly ($20/mo)
            </button>
            <button
              onClick={() => setProBillingFreq('yearly')}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: proBillingFreq === 'yearly' ? '#1967D2' : '#404040',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Yearly ($240/yr)
            </button>
          </div>
        </div>
      )}

      {selectedTier === 'proMax' && (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.9em', marginBottom: 8 }}>Variant</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setProMaxVariant('5x')}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: proMaxVariant === '5x' ? '#1967D2' : '#404040',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              5x ($95/mo)
            </button>
            <button
              onClick={() => setProMaxVariant('20x')}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: proMaxVariant === '20x' ? '#1967D2' : '#404040',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              20x ($240/mo)
            </button>
          </div>
        </div>
      )}

      {!selectedTier ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {(['pro', 'proMax', 'team', 'enterprise'] as SubscriptionTierId[]).map((tier) => {
            const isContactSales = tier === 'team' || tier === 'enterprise';
            const tierLabel = tier === 'proMax' ? 'Pro Max' : tier.charAt(0).toUpperCase() + tier.slice(1);

            if (isContactSales) {
              const subject = encodeURIComponent(`${tierLabel} Plan Inquiry`);
              const mailtoLink = `mailto:pawos@revantaai.com?subject=${subject}`;

              return (
                <a
                  key={tier}
                  href={mailtoLink}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#1967D2',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: '0.9em',
                    fontWeight: 500,
                    textDecoration: 'none',
                    display: 'block',
                    textAlign: 'center',
                  }}
                >
                  {`Contact Sales`}
                </a>
              );
            }

            return (
              <button
                key={tier}
                onClick={() => setSelectedTier(tier)}
                disabled={currentTier === tier}
                style={{
                  padding: '12px 16px',
                  backgroundColor: currentTier === tier ? '#666' : '#1967D2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: currentTier === tier ? 'not-allowed' : 'pointer',
                  fontSize: '0.9em',
                  fontWeight: 500,
                  opacity: currentTier === tier ? 0.6 : 1,
                }}
              >
                Get {tierLabel}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setSelectedTier(null)}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: '#404040',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleTierPayment(selectedTier)}
            disabled={busy}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: busy ? '#606060' : '#1967D2',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {busy ? 'Processing...' : 'Pay Now'}
          </button>
        </div>
      )}

      {message && (
        <p style={{
          margin: '12px 0 0 0',
          padding: '10px 12px',
          backgroundColor: message.includes('error') || message.includes('failed') ? 'rgba(239,68,68,0.1)' : 'rgba(76,176,80,0.1)',
          color: message.includes('error') || message.includes('failed') ? '#ef4444' : '#4cb050',
          borderRadius: 4,
          fontSize: '0.9em',
        }}>
          {message}
        </p>
      )}
    </div>
  );
}
