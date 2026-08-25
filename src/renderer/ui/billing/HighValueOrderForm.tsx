import React, { useState } from 'react';
import styles from './billingModal.module.css';

interface HighValueOrderFormProps {
  tier: 'team' | 'enterprise';
  seatCount: number;
  basePriceUsd: number;
  totalUsd: number;
  totalInr: number;
  onSubmit: (data: HighValueOrderData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export interface HighValueOrderData {
  customerName: string;
  organizationName: string;
  billingEmail: string;
  hasGst: boolean;
  gstPercent?: number;
}

export function HighValueOrderForm({
  tier,
  seatCount,
  basePriceUsd,
  totalUsd,
  totalInr,
  onSubmit,
  onCancel,
  isSubmitting,
}: HighValueOrderFormProps) {
  const [formData, setFormData] = useState<HighValueOrderData>({
    customerName: '',
    organizationName: '',
    billingEmail: '',
    hasGst: false,
    gstPercent: 18,
  });
  const [errors, setErrors] = useState<Partial<HighValueOrderData>>({});

  function validate(): boolean {
    const newErrors: Partial<HighValueOrderData> = {};
    if (!formData.customerName.trim()) newErrors.customerName = 'Required';
    if (!formData.organizationName.trim()) newErrors.organizationName = 'Required';
    if (!formData.billingEmail.trim() || !formData.billingEmail.includes('@')) {
      newErrors.billingEmail = 'Valid email required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  }

  const tierLabel = tier === 'team' ? 'Paw Team' : tier === 'enterprise' ? 'Paw Enterprise' : 'PawOS Credits';
  const seatLabel = tier === 'team' ? 'Seats' : tier === 'enterprise' ? 'Members' : 'Purchase';

  return (
    <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 700 }}>Order Summary</h3>

      <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '4px', fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>{tierLabel}</span>
          <span>${basePriceUsd.toFixed(2)}/month per seat</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>{seatCount} {seatLabel.toLowerCase()}</span>
          <span>${(seatCount * basePriceUsd).toFixed(2)}</span>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>Total (first month)</span>
          <span>₹{totalInr.toLocaleString()}</span>
        </div>
      </div>

      <h3 style={{ margin: '8px 0 8px 0', fontSize: 16, fontWeight: 700 }}>Billing Details</h3>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Your Name *</span>
        <input
          type="text"
          value={formData.customerName}
          onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
          placeholder="Your full name"
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {errors.customerName && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{errors.customerName}</span>}
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Organization Name *</span>
        <input
          type="text"
          value={formData.organizationName}
          onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
          placeholder="Your organization name"
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {errors.organizationName && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{errors.organizationName}</span>}
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Billing Email *</span>
        <input
          type="email"
          value={formData.billingEmail}
          onChange={(e) => setFormData({ ...formData, billingEmail: e.target.value })}
          placeholder="billing@company.com"
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: 'inherit',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
        {errors.billingEmail && <span style={{ fontSize: 11, color: '#ff6b6b' }}>{errors.billingEmail}</span>}
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={formData.hasGst}
          onChange={(e) => setFormData({ ...formData, hasGst: e.target.checked })}
        />
        <span style={{ fontSize: 13 }}>Add GST details to invoice</span>
      </label>

      {formData.hasGst && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>GST %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={formData.gstPercent || 18}
            onChange={(e) => setFormData({ ...formData, gstPercent: parseFloat(e.target.value) })}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.2)',
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'inherit',
              fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
        </label>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'transparent',
            color: 'inherit',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.5 : 1,
            fontWeight: 500,
          }}
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: 'white',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.5 : 1,
            fontWeight: 600,
          }}
        >
          {isSubmitting ? 'Creating invoices...' : 'Continue to Payment'}
        </button>
      </div>
    </form>
  );
}
