import React, { useEffect, useState } from 'react';
import type { SubscriptionTierId, CheckoutOptions } from '../../../shared/billing/BillingTypes';
import { initiateRazorpayTierPayment } from '../Dashboard/sections/TierPaymentHandler';

type Props = {
  tier: SubscriptionTierId;
  options?: CheckoutOptions;
  onClose: () => void;
  onSuccess?: () => void;
};

export function TierCheckoutPage({ tier, options, onClose, onSuccess }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');

  useEffect(() => {
    const initPayment = async () => {
      try {
        const supabase = await import('../../auth/supabaseClient').then(m => m.getSupabaseClient());
        const { data: sessionData } = await supabase.auth.getSession();
        const email = sessionData.session?.user?.email || '';
        setUserEmail(email);

        const paymentOptions: any = {};
        if (tier === 'proMax') paymentOptions.proMaxVariant = options?.proMaxVariant;
        if (tier === 'pro') paymentOptions.proBillingFrequency = options?.proBillingFrequency || 'monthly';

        await initiateRazorpayTierPayment(tier, { setMessage, setBusy, refresh: onSuccess || (() => {}), userEmail: email }, paymentOptions);
      } catch (error) {
        setMessage(`❌ ${error instanceof Error ? error.message : 'Payment failed'}`);
        setBusy(false);
      }
    };
    initPayment();
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--pawos-bg)', color: 'var(--pawos-fg)', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
      <div style={{ fontSize: 32, opacity: 0.6 }}>⏳</div>
      <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }}>Opening secure checkout...</div>
      <div style={{ fontSize: 14, color: 'var(--pawos-text-secondary)', textAlign: 'center', maxWidth: 300 }}>
        Redirecting to Razorpay to complete your purchase.
      </div>
      {message && (
        <div style={{ fontSize: 12, color: message.includes('❌') ? '#ef4444' : '#4cb050', marginTop: 16 }}>
          {message}
        </div>
      )}
      <button
        onClick={onClose}
        style={{
          marginTop: 24,
          padding: '10px 24px',
          backgroundColor: '#404040',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: '0.9em',
          fontWeight: 500,
        }}
      >
        Cancel
      </button>
    </div>
  );
}
