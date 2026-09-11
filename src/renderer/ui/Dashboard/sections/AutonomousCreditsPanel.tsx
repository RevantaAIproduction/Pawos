import React, { useState } from 'react';
import { initiateRazorpayCreditsPayment } from './CreditsPaymentHandler';

interface AutonomousCreditsProps {
  userEmail: string;
  onPaymentComplete: () => void;
}

export function AutonomousCreditsPanel({ userEmail, onPaymentComplete }: AutonomousCreditsProps) {
  const [showModal, setShowModal] = useState(false);
  const [amount, setAmount] = useState('30');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const presets = [30, 60, 100, 150, 200];

  const handlePay = async () => {
    const amountUsd = parseFloat(amount);
    if (!amountUsd || amountUsd < 30) {
      setMessage('❌ Minimum $30 required');
      return;
    }
    if (amountUsd > 20000) {
      setMessage('❌ Maximum $20,000 per transaction');
      return;
    }

    const options = {
      setMessage,
      setBusy,
      refresh: onPaymentComplete,
      userEmail,
    };

    await initiateRazorpayCreditsPayment(amountUsd, true, options);
  };

  if (!showModal) {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>🤖 Autonomous Work Credits</h3>
        <p style={{ fontSize: '0.85em', opacity: 0.6, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Automatic task solving credits. PawOS solves problems autonomously. Minimum $30, maximum $20,000 per purchase.
        </p>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '10px 24px',
            backgroundColor: '#1967D2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: '0.9em',
            fontWeight: 500,
          }}
        >
          Buy Autonomous Credits
        </button>
      </div>
    );
  }

  const inrAmount = Math.round(parseFloat(amount) * 95.65);

  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Buy Autonomous Work Credits</h3>

      <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: 8, fontWeight: 500 }}>Amount (USD) *</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="30"
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
          onClick={() => setShowModal(false)}
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
