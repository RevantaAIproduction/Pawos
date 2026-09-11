import React, { useState } from 'react';
import { submitEnterpriseContact } from './EnterpriseContactHandler';
import type { EnterpriseContactForm } from './EnterpriseContactHandler';

interface EnterpriseContactPanelProps {
  userEmail: string;
  onSubmitComplete: () => void;
}

export function EnterpriseContactPanel({ userEmail, onSubmitComplete }: EnterpriseContactPanelProps) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<EnterpriseContactForm>({
    name: '',
    email: userEmail,
    company: '',
    phone: '',
    seatsNeeded: 20,
    message: '',
  });

  const handleSubmit = async () => {
    const options = {
      setMessage,
      setBusy,
      userEmail,
      userName: form.name,
    };

    await submitEnterpriseContact(form, options);

    if (!message?.includes('Error') && !message?.includes('failed')) {
      setTimeout(() => {
        setShow(false);
        setForm({
          name: '',
          email: userEmail,
          company: '',
          phone: '',
          seatsNeeded: 20,
          message: '',
        });
        onSubmitComplete();
      }, 2000);
    }
  };

  if (!show) {
    return (
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Enterprise Plan</h3>
        <p style={{ fontSize: '0.85em', opacity: 0.6, margin: '0 0 12px 0', lineHeight: 1.5 }}>
          Custom pricing, dedicated support, and advanced features tailored to your organization.
        </p>
        <button
          onClick={() => setShow(true)}
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
          Contact Sales
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Enterprise Inquiry</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Full Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.9em',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.9em',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Company *</label>
          <input
            type="text"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.9em',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Phone *</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+1 (555) 000-0000"
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#fff',
              fontSize: '0.9em',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Seats Needed (min 20) *</label>
        <input
          type="number"
          value={form.seatsNeeded}
          onChange={(e) => setForm({ ...form, seatsNeeded: Math.max(20, parseInt(e.target.value) || 20) })}
          min={20}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            color: '#fff',
            fontSize: '0.9em',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: '0.85em', opacity: 0.7, marginBottom: 6 }}>Requirements (optional)</label>
        <textarea
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="Tell us about your needs..."
          rows={4}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 4,
            color: '#fff',
            fontSize: '0.9em',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setShow(false)}
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
          onClick={handleSubmit}
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
          {busy ? 'Submitting...' : 'Submit Inquiry'}
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
          whiteSpace: 'pre-wrap',
        }}>
          {message}
        </p>
      )}
    </div>
  );
}
