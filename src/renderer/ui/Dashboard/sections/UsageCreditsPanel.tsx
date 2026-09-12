import React, { useState } from 'react';
import { initiateRazorpayCreditsPayment } from './CreditsPaymentHandler';

interface UsageCreditsProps {
  userEmail: string;
  onPaymentComplete: () => void;
}

export function UsageCreditsPanel({ userEmail, onPaymentComplete }: UsageCreditsProps) {
  const [step, setStep] = useState<'closed' | 'amount' | 'summary'>('closed');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const presets = [5, 10, 30, 50, 100];
  const inrAmount = Math.round(parseFloat(amount) * 95.65);
  const amountUsd = parseFloat(amount);

  const validateAmount = () => {
    if (!amountUsd || amountUsd < 5) {
      setMessage('❌ Minimum $5 required');
      return false;
    }
    if (amountUsd > 20000) {
      setMessage('❌ Maximum $20,000 per transaction');
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

  if (step === 'closed') {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>💰 Usage Credits</h3>
        <p style={{ fontSize: '0.85em', opacity: 0.6, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Pay-as-you-go compute credits. Minimum $5, maximum $20,000 per purchase.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: '1.5em', fontWeight: 700, margin: '0 0 4px 0' }}>$0.00</div>
            <p style={{ fontSize: '0.85em', opacity: 0.6, margin: 0 }}>Current balance</p>
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
            min="5"
            max="20000"
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
            <div style={{ marginBottom: 4 }}>Exchange Rate: 1 USD = ₹95.65</div>
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
          ≈ ${amountUsd.toFixed(2)} USD @ ₹95.65/USD
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
