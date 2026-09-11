import React, { useState } from 'react';
import { initiateRazorpayCreditsPayment } from './CreditsPaymentHandler';

interface CreditsPurchasePanelProps {
  userEmail: string;
  onPaymentComplete: () => void;
}

export function CreditsPurchasePanel({ userEmail, onPaymentComplete }: CreditsPurchasePanelProps) {
  const [creditType, setCreditType] = useState<'usage' | 'autonomous' | null>(null);
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const presets = creditType === 'usage' ? [5, 10, 30, 50, 100] : [30, 60, 100, 150, 200];

  const handlePay = async () => {
    const amountUsd = parseFloat(amount);
    if (!amountUsd || amountUsd <= 0) {
      setMessage('❌ Enter a valid amount');
      return;
    }

    const options = {
      setMessage,
      setBusy,
      refresh: onPaymentComplete,
      userEmail,
    };

    await initiateRazorpayCreditsPayment(amountUsd, creditType === 'autonomous', options);
  };

  if (!creditType) {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Buy Credits</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button
            onClick={() => setCreditType('usage')}
            style={{
              padding: '16px',
              backgroundColor: '#1967D2',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.95em',
              fontWeight: 500,
            }}
          >
            💰 Usage Credits<br/>
            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Min: $5</span>
          </button>
          <button
            onClick={() => setCreditType('autonomous')}
            style={{
              padding: '16px',
              backgroundColor: '#1967D2',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.95em',
              fontWeight: 500,
            }}
          >
            🤖 Autonomous Work<br/>
            <span style={{ fontSize: '0.85em', opacity: 0.8 }}>Min: $30</span>
          </button>
        </div>
      </div>
    );
  }

  const label = creditType === 'usage' ? 'Usage Credits' : 'Autonomous Work Credits';

  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Buy {label}</h3>

      <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: 8 }}>Amount (USD)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={creditType === 'usage' ? 5 : 30}
          max={20000}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            color: '#fff',
            fontSize: '1em',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
              }}
            >
              ${p}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: '0.85em', opacity: 0.7 }}>
          ≈ ₹{Math.round(parseFloat(amount) * 95.65).toLocaleString()} INR
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setCreditType(null)}
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
          {busy ? 'Processing...' : 'Pay Now'}
        </button>
      </div>

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
