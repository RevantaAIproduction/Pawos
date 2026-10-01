import React, { useState, useEffect } from 'react';
import { initiateMidMonthPayment, initiateRazorpayCreditsPayment } from './CreditsPaymentHandler';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../../auth/supabaseClient';
import type { MidMonthOfferResult, UsageCreditsPurchaseConfig } from '../../../../shared/billing/UsageBucketTypes';

interface UsageCreditsProps {
  userEmail: string;
  onPaymentComplete: () => void;
}

export function UsageCreditsPanel({ userEmail, onPaymentComplete }: UsageCreditsProps) {
  const [step, setStep] = useState<'closed' | 'amount' | 'summary'>('closed');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Credits are customer value in PC ($1 = 100 PC), one bucket per purchase, from the server.
  const [remainingPc, setRemainingPc] = useState<number | null>(null);
  const [usedPc, setUsedPc] = useState<number>(0);
  const [offer, setOffer] = useState<MidMonthOfferResult | null>(null);
  // Presets, bounds, INR rate and PC per dollar come from the server's configuration.
  const [purchaseConfig, setPurchaseConfig] = useState<UsageCreditsPurchaseConfig | null>(null);

  const fetchBalance = async () => {
    try {
      const summary = await ipc.billingGetUsageSummary(true);
      const credits = (summary?.buckets ?? []).filter((b) => b.type === 'purchased_credits' && (b.status === 'active' || b.status === 'exhausted'));
      setRemainingPc(summary?.creditsPcRemaining ?? 0);
      setUsedPc(credits.reduce((sum, b) => sum + b.pcUsed, 0));
    } catch (error) {
      console.error('Failed to fetch usage summary:', error);
      setRemainingPc(0);
    }
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) setOffer(await ipc.billingGetMidMonthOffer(data.session.access_token));
    } catch {
      setOffer(null);
    }
  };

  useEffect(() => {
    fetchBalance();
    ipc.billingGetUsageCreditsConfig().then(setPurchaseConfig).catch(() => setPurchaseConfig({ ok: false, reason: 'Credit purchases are unavailable right now.' }));
  }, []);

  useEffect(() => {
    ipc.onUsageCreditsPurchased(() => {
      fetchBalance();
      onPaymentComplete();
    });
  }, [onPaymentComplete]);

  const config = purchaseConfig && purchaseConfig.ok ? purchaseConfig : null;
  const presets = config?.topupPresetsUsd ?? [];
  const amountUsd = parseFloat(amount);
  const inrAmount = config ? Math.round(amountUsd * config.usdInrRate) : 0;
  const purchasedPc = config ? Math.round(amountUsd * config.pcPerUsd) : 0;

  const validateAmount = () => {
    if (!config) {
      setMessage(`[error] ${purchaseConfig && !purchaseConfig.ok ? purchaseConfig.reason : 'Credit purchases are unavailable right now.'}`);
      return false;
    }
    if (!amountUsd || amountUsd < config.minTopupUsd) {
      setMessage(`[error] Minimum $${config.minTopupUsd.toLocaleString()} required`);
      return false;
    }
    if (amountUsd > config.maxTopupUsd) {
      setMessage(`[error] Maximum $${config.maxTopupUsd.toLocaleString()} per transaction`);
      return false;
    }
    setMessage(null);
    return true;
  };

  const handleNext = () => {
    if (validateAmount()) {
      setStep('summary');
    }
  };

  const handlePay = async () => {
    setBusy(true);
    const options = { setMessage, setBusy, refresh: onPaymentComplete, userEmail };
    await initiateRazorpayCreditsPayment(amountUsd, false, options);
  };

  const handleBuyExtraUsage = async () => {
    const options = { setMessage, setBusy, refresh: () => { fetchBalance(); onPaymentComplete(); }, userEmail };
    await initiateMidMonthPayment(options);
  };

  const extraUsageOffer = offer && offer.ok && offer.available ? offer : null;
  const extraUsageBlock = extraUsageOffer ? (
    <div style={{ marginTop: 16, padding: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)' }} data-testid="mid-month-offer">
      <div style={{ fontSize: '0.95em', fontWeight: 600, marginBottom: 4 }}>{extraUsageOffer.label}</div>
      <div style={{ fontSize: '0.85em', opacity: 0.75, lineHeight: 1.5, marginBottom: 10 }}>
        ${extraUsageOffer.amountUsd.toFixed(2)} adds {extraUsageOffer.pc.toLocaleString()} PC for the rest of your current plan period.
        It expires on {new Date(extraUsageOffer.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, when your plan renews.
      </div>
      <button
        onClick={handleBuyExtraUsage}
        disabled={busy}
        style={{ padding: '8px 18px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.9em', fontWeight: 500 }}
      >
        {busy ? 'Processing...' : `Buy extra usage — $${extraUsageOffer.amountUsd.toFixed(2)}`}
      </button>
    </div>
  ) : null;

  if (step === 'closed') {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>💰 Usage Credits</h3>
        <p style={{ fontSize: '0.85em', opacity: 0.6, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Pay-as-you-go credits{config ? `. Minimum $${config.minTopupUsd.toLocaleString()}, maximum $${config.maxTopupUsd.toLocaleString()} per purchase.` : '.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>
              Remaining: {remainingPc !== null ? `${remainingPc.toLocaleString()} PC` : '...'}
            </div>
            <div style={{ fontSize: '0.9em', opacity: 0.7 }}>
              Used: {usedPc.toLocaleString()} PC
            </div>
          </div>
          <button
            onClick={() => { setStep('amount'); setMessage(null); }}
            style={{
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
            Buy usage credits
          </button>
        </div>
        {extraUsageBlock}
        {message && (
          <p style={{ margin: '12px 0 0 0', fontSize: '0.9em', color: message.includes('error') ? '#ef4444' : '#4cb050' }}>{message}</p>
        )}
      </div>
    );
  }

  if (step === 'amount') {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Buy Usage Credits</h3>

        <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.9em', marginBottom: 8, fontWeight: 500 }}>Amount (USD) *</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={config?.minTopupUsd}
            max={config?.maxTopupUsd}
            step="1"
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '1em',
              boxSizing: 'border-box',
              marginBottom: 12,
            }}
          />

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {presets.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(String(p))}
                style={{
                  padding: '6px 12px',
                  backgroundColor: amount === String(p) ? '#1967D2' : '#404040',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  fontWeight: amount === String(p) ? 600 : 400,
                }}
              >
                ${p}
              </button>
            ))}
          </div>

          <div style={{ backgroundColor: 'rgba(25, 103, 210, 0.1)', borderRadius: 4, padding: 10, fontSize: '0.85em' }}>
            {config && <div style={{ marginBottom: 4 }}>Exchange Rate: 1 USD = ₹{config.usdInrRate}</div>}
            <div style={{ fontWeight: 600, color: '#64B5F6' }}>
              Total: ₹{inrAmount.toLocaleString()} INR
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setStep('closed')}
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
            onClick={handleNext}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: '#1967D2',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Next
          </button>
        </div>

        {message && (
          <p style={{
            margin: '12px 0 0 0',
            padding: '10px 12px',
            backgroundColor: message.includes('error') || message.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(76,176,80,0.1)',
            color: message.includes('error') || message.includes('Error') ? '#ef4444' : '#4cb050',
            borderRadius: 4,
            fontSize: '0.9em',
          }}>
            {message}
          </p>
        )}
      </div>
    );
  }

  // Summary step
  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Order Summary</h3>

      <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.9em' }}>
          <div style={{ opacity: 0.7 }}>Usage Credits</div>
          <div style={{ fontWeight: 600 }}>₹{inrAmount.toLocaleString()}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.9em' }}>
          <div style={{ opacity: 0.7 }}>Subtotal</div>
          <div style={{ fontWeight: 600 }}>₹{inrAmount.toLocaleString()}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.9em' }}>
          <div style={{ opacity: 0.7 }}>GST (0%)</div>
          <div style={{ fontWeight: 600, color: '#4cb050' }}>Free</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1em', fontWeight: 700, marginBottom: 12 }}>
          <div>Total Due Today</div>
          <div>₹{inrAmount.toLocaleString()}</div>
        </div>

        <div style={{ fontSize: '0.85em', opacity: 0.6 }}>
          ≈ ${amountUsd.toFixed(2)} USD{config ? ` @ ₹${config.usdInrRate}/USD` : ''} · adds {purchasedPc.toLocaleString()} PC (no expiry)
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setStep('amount')}
          disabled={busy}
          style={{
            flex: 1,
            padding: '10px 16px',
            backgroundColor: '#404040',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}
        >
          Back
        </button>
        <button
          onClick={handlePay}
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
          {busy ? 'Processing...' : `Pay ₹${inrAmount.toLocaleString()}`}
        </button>
      </div>

      {message && (
        <p style={{
          margin: '12px 0 0 0',
          padding: '10px 12px',
          backgroundColor: message.includes('error') || message.includes('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(76,176,80,0.1)',
          color: message.includes('error') || message.includes('Error') ? '#ef4444' : '#4cb050',
          borderRadius: 4,
          fontSize: '0.9em',
        }}>
          {message}
        </p>
      )}
    </div>
  );
}
