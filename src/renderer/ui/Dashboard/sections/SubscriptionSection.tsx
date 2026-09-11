import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';
import type { AuthUser } from '../../../auth/AuthTypes';
import {
  SUBSCRIPTION_TIER_ORDER,
  type PricingConfig,
  type PricingPlan,
  type SubscriptionState,
  type SubscriptionTierId,
  type EntitlementSnapshot,
} from '../../../../shared/billing/BillingTypes';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Go',
  pro: 'Pro',
  proMax: 'Pro Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

function detectCardBrand(cardNumber: string): 'visa' | 'mastercard' | 'rupay' | 'unknown' {
  const cleaned = cardNumber.replace(/\s/g, '');
  if (/^4[0-9]{12}(?:[0-9]{3})?$/.test(cleaned)) return 'visa';
  if (/^5[1-5][0-9]{14}$/.test(cleaned)) return 'mastercard';
  if (/^607481[0-9]{10}$/.test(cleaned)) return 'rupay';
  if (/^9[0-9]{15}$/.test(cleaned)) return 'rupay';
  return 'unknown';
}

function formatCardNumber(value: string): string {
  const cleaned = value.replace(/\s/g, '');
  const chunks = cleaned.match(/.{1,4}/g) || [];
  return chunks.join(' ');
}

function formatPrice(plan: PricingPlan | undefined): string {
  if (!plan) return '…';
  if (plan.seatBased) {
    const range = plan.maxSeats ? `${plan.minSeats}–${plan.maxSeats} members` : `${plan.minSeats}+ users`;
    return plan.priceCents === null ? `Custom pricing — ${range}` : `$${(plan.priceCents / 100).toFixed(2)}/seat/${plan.billingPeriod} — ${range}`;
  }
  if (plan.priceCents === null) return 'Pricing not finalized yet';
  if (plan.priceCents === 0) return 'Free';
  return `$${(plan.priceCents / 100).toFixed(2)}/${plan.billingPeriod}`;
}

export function SubscriptionSection({
  user,
  onGoToAccount,
  onUpgrade,
}: {
  user: AuthUser;
  onGoToAccount: () => void;
  onUpgrade: () => void;
}) {
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAutoReloadModal, setShowAutoReloadModal] = useState(false);
  const [autoReloadAmount, setAutoReloadAmount] = useState('10');
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
  const [showCreditsAmountModal, setShowCreditsAmountModal] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState('10');
  const [showCreditsCardForm, setShowCreditsCardForm] = useState(false);
  const [showAutonomousAmountModal, setShowAutonomousAmountModal] = useState(false);
  const [autonomousAmount, setAutonomousAmount] = useState('30');
  const [showAutonomousCardForm, setShowAutonomousCardForm] = useState(false);
  const [showCreditsSummary, setShowCreditsSummary] = useState(false);
  const [showAutonomousSummary, setShowAutonomousSummary] = useState(false);
  const [creditsCardName, setCreditsCardName] = useState('');
  const [creditsCardEmail, setCreditsCardEmail] = useState('');
  const [creditsCardCountry, setCreditsCardCountry] = useState('India');
  const [creditsCardPhone, setCreditsCardPhone] = useState('');
  const [creditsCardAddress, setCreditsCardAddress] = useState('');
  const [creditsCardAddress2, setCreditsCardAddress2] = useState('');
  const [creditsCardCity, setCreditsCardCity] = useState('');
  const [creditsCardState, setCreditsCardState] = useState('');
  const [creditsCardPincode, setCreditsCardPincode] = useState('');
  const [creditsCardTaxId, setCreditsCardTaxId] = useState('');
  const [creditsCardNumber, setCreditsCardNumber] = useState('');
  const [creditsCardExpiry, setCreditsCardExpiry] = useState('');
  const [creditsCardCvc, setCreditsCardCvc] = useState('');
  const [creditsCardBrand, setCreditsCardBrand] = useState<'visa' | 'mastercard' | 'rupay' | 'unknown'>('unknown');
  const [creditsSaveCard, setCreditsSaveCard] = useState(false);
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);

  const refresh = () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  };

  useEffect(() => {
    if (user.isGuest) return;
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    ipc.onSubscriptionUpdated(() => {
      refresh();
      setMessage('Payment confirmed — your plan has been updated.');
    });

    // Load auto-reload configuration
    ipc.billingGetAutoReload()
      .then((config) => {
        if (config.enabled && config.amount) {
          setAutoReloadEnabled(true);
          setAutoReloadAmount(String(config.amount));
        }
      })
      .catch(() => {
        // Silently handle errors - auto-reload is optional
      });

    return () => window.removeEventListener('focus', onFocus);
  }, [user.isGuest]);

  const downgrade = async (tier: SubscriptionTierId) => {
    setBusy(true);
    setMessage(null);
    try {
      await ipc.billingSetSubscriptionTier(tier);
      refresh();
      setMessage(`Switched to ${TIER_LABELS[tier]}.`);
    } finally {
      setBusy(false);
    }
  };

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No plan yet — you're previewing PawOS as a guest</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Guest sessions are sample access only — no subscription, billing, or usage tracking
          applies. Create a free account to start on <strong>Paw Go</strong> (completely free),
          then upgrade to Pro, Pro Max, Team, or Enterprise whenever you're ready.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} onClick={onGoToAccount}>
          Create free account
        </button>
      </div>
    );
  }

  const currentTier = subscription?.tier ?? 'go';
  const currentPlan = pricing?.plans.find((p) => p.id === currentTier);
  const renewalDate = subscription?.renewsAt ? new Date(subscription.renewsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
  const billingPeriod = currentPlan?.billingPeriod === 'month' ? 'Monthly' : currentPlan?.billingPeriod === 'year' ? 'Yearly' : 'N/A';

  return (
    <>
    <div>
      {/* Current plan */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <h2 style={{ fontSize: '1.4em', fontWeight: 700, margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>{currentPlan?.label ?? '…'}</h2>
          <p style={{ margin: '0 0 4px 0', fontSize: '0.9em', opacity: 0.7 }}>{billingPeriod}</p>
          <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.6 }}>Your subscription will auto renew on {renewalDate}.</p>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={onUpgrade}>
          Adjust plan
        </button>
      </div>

      {/* Usage credits */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Usage credits</h3>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.85em', opacity: 0.65, lineHeight: 1.5 }}>
          Buy usage credits so your team can keep using Claude when they hit a plan limit. Your monthly spend limit still applies.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <p style={{ margin: 0, fontSize: '1.6em', fontWeight: 700, letterSpacing: '-0.5px' }}>$0.00</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Current balance</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={{ padding: '8px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsAmountModal(true)}>
              Buy usage credits
            </button>
            <span style={{ fontSize: '0.75em', backgroundColor: '#1967D2', color: 'white', padding: '4px 10px', borderRadius: 3, whiteSpace: 'nowrap', fontWeight: 600 }}>
              Up to 30% off
            </span>
          </div>
        </div>
      </div>

      {/* Autonomous Ticket Credit */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1em', fontWeight: 600, margin: 0 }}>Autonomous Ticket Credit</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Buy credits for autonomous ticket resolution</p>
          </div>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              style={{
                padding: '8px 16px',
                backgroundColor: '#404040',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.9em',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                opacity: 1,
              }}
              onClick={() => setShowAutonomousAmountModal(true)}
            >
              Buy credit
            </button>
          </div>
        </div>
      </div>

      {/* Tier Checkout Form Component Fallback - Only for credit flows */}
      {(showCreditsCardForm || showAutonomousCardForm) && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflow: 'auto' }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 40, maxWidth: 600, width: '90%', margin: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: 0 }}>Billing information</h2>
              <button type="button" onClick={() => {
                showCreditsCardForm && setShowCreditsCardForm(false);
                showAutonomousCardForm && setShowAutonomousCardForm(false);
              }} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#fff', opacity: 0.7 }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Full name <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="Your full name"
                  value={creditsCardName}
                  onChange={(e) => setCreditsCardName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={creditsCardEmail}
                  onChange={(e) => setCreditsCardEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Country or region <span style={{ color: '#ef4444' }}>*</span></label>
                <select
                  value={creditsCardCountry}
                  onChange={(e) => setCreditsCardCountry(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                >
                  <option value="India">India</option>
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Phone number <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={creditsCardPhone}
                  onChange={(e) => setCreditsCardPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Address line 1 <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="Start typing your address"
                  value={creditsCardAddress}
                  onChange={(e) => setCreditsCardAddress(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Address line 2</label>
                <input
                  type="text"
                  placeholder="Apartment, suite, etc. (optional)"
                  value={creditsCardAddress2}
                  onChange={(e) => setCreditsCardAddress2(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>City <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="City"
                    value={creditsCardCity}
                    onChange={(e) => setCreditsCardCity(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>PIN <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="Postal code"
                    value={creditsCardPincode}
                    onChange={(e) => setCreditsCardPincode(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>State <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  placeholder="State/Province"
                  value={creditsCardState}
                  onChange={(e) => setCreditsCardState(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Business tax ID (Optional)</label>
                <input
                  type="text"
                  placeholder="GST/Tax ID"
                  value={creditsCardTaxId}
                  onChange={(e) => setCreditsCardTaxId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Payment method</div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Card number</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="1234 1234 1234 1234"
                      value={creditsCardNumber}
                      onChange={(e) => {
                        const formatted = formatCardNumber(e.target.value);
                        setCreditsCardNumber(formatted);
                        setCreditsCardBrand(detectCardBrand(formatted));
                      }}
                      maxLength={19}
                      style={{ width: '100%', padding: '10px 12px 10px 110px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                    />
                    <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="28" height="18" viewBox="0 0 48 32" style={{ borderRadius: 2, opacity: creditsCardBrand === 'visa' ? 1 : 0.3 }}>
                        <rect width="48" height="32" fill="#1434CB"/>
                        <text x="24" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">VISA</text>
                      </svg>
                      <svg width="28" height="18" viewBox="0 0 48 32" style={{ borderRadius: 2, opacity: creditsCardBrand === 'mastercard' ? 1 : 0.3 }}>
                        <rect width="48" height="32" fill="#EB001B"/>
                        <circle cx="20" cy="16" r="8" fill="white" opacity="0.3"/>
                        <circle cx="28" cy="16" r="8" fill="white" opacity="0.3"/>
                      </svg>
                      <svg width="28" height="18" viewBox="0 0 48 32" style={{ borderRadius: 2, opacity: creditsCardBrand === 'rupay' ? 1 : 0.3 }}>
                        <rect width="48" height="32" fill="white" stroke="#999"/>
                        <text x="24" y="20" textAnchor="middle" fill="#0066CC" fontSize="7" fontWeight="bold">RUPAY</text>
                      </svg>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Expiration date</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      value={creditsCardExpiry}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length >= 2) {
                          value = value.slice(0, 2) + '/' + value.slice(2, 4);
                        }
                        setCreditsCardExpiry(value);
                      }}
                      maxLength={5}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Security code</label>
                    <input
                      type="text"
                      placeholder="CVC"
                      value={creditsCardCvc}
                      onChange={(e) => setCreditsCardCvc(e.target.value.replace(/\D/g, ''))}
                      maxLength={4}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => {
                  showCreditsCardForm && setShowCreditsCardForm(false);
                  showAutonomousCardForm && setShowAutonomousCardForm(false);
                }} style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }}>
                  Cancel
                </button>
                <button type="button" onClick={() => {
                  const isCredits = showCreditsCardForm;
                  const amount = parseFloat(isCredits ? creditsAmount : autonomousAmount);

                  setCheckoutIntent({
                    kind: isCredits ? 'usageCredits' : 'autonomousWorkCredits',
                    amountUsd: amount,
                    title: isCredits ? 'Buy Usage Credits' : 'Autonomous Work Credits',
                    cardDetails: {
                      name: creditsCardName,
                      email: creditsCardEmail,
                      country: creditsCardCountry,
                      phone: creditsCardPhone,
                      address: creditsCardAddress,
                      address2: creditsCardAddress2,
                      city: creditsCardCity,
                      state: creditsCardState,
                      pincode: creditsCardPincode,
                      taxId: creditsCardTaxId,
                      cardNumber: creditsCardNumber,
                      expiry: creditsCardExpiry,
                      cvc: creditsCardCvc,
                    },
                  });

                  setShowCreditsCardForm(false);
                  setShowAutonomousCardForm(false);
                }} style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }}>
                  Pay ₹{Math.round(parseFloat(showCreditsCardForm ? creditsAmount : autonomousAmount) * 95.65).toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Credits Amount Modal */}
      {showCreditsAmountModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Buy usage credits</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Enter the amount of usage credits you want to purchase ($5 - $20,000).
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount (USD)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
                <input
                  type="number"
                  min="5"
                  max="20000"
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsAmountModal(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                const amount = parseFloat(creditsAmount);
                if (Number.isFinite(amount) && amount >= 5 && amount <= 20000) {
                  setShowCreditsAmountModal(false);
                  setTimeout(() => {
                    setShowCreditsCardForm(true);
                  }, 100);
                } else {
                  setMessage('Please enter a valid amount between $5 and $20,000.');
                }
              }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Autonomous Ticket Credit Amount Modal */}
      {showAutonomousAmountModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Buy autonomous credits</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Enter the amount of autonomous ticket credits you want to purchase ($30 - $20,000).
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount (USD)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
                <input
                  type="number"
                  min="30"
                  max="20000"
                  value={autonomousAmount}
                  onChange={(e) => setAutonomousAmount(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowAutonomousAmountModal(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                const amount = parseFloat(autonomousAmount);
                if (Number.isFinite(amount) && amount >= 30 && amount <= 20000) {
                  setShowAutonomousAmountModal(false);
                  setTimeout(() => {
                    setShowAutonomousCardForm(true);
                  }, 100);
                } else {
                  setMessage('Please enter a valid amount between $30 and $20,000.');
                }
              }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Credits Payment Summary — REMOVED, goes directly to Razorpay */}
      {false && showCreditsSummary && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 40, maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Order Details</h2>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 20, marginTop: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9em', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ opacity: 0.7 }}>Amount</div>
                <div style={{ fontWeight: 600 }}>${parseFloat(creditsAmount).toFixed(2)}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9em', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ opacity: 0.7 }}>Exchange rate</div>
                <div style={{ fontWeight: 600 }}>1 USD = ₹95.65</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '1em', fontWeight: 700 }}>
                <div>Total due today</div>
                <div>₹{Math.round(parseFloat(creditsAmount) * 95.65).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div>ℹ️</div>
                <div>One-time purchase. Charged in Indian Rupees (INR) at the rate shown above.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsSummary(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                setShowCreditsSummary(false);
                setTimeout(() => {
                  const amount = parseFloat(creditsAmount);
                  setCheckoutIntent({
                    kind: 'usageCredits',
                    amountUsd: amount,
                    title: 'Buy Usage Credits',
                    cardDetails: {
                      name: creditsCardName,
                      email: creditsCardEmail,
                      country: creditsCardCountry,
                      phone: creditsCardPhone,
                      address: creditsCardAddress,
                      address2: creditsCardAddress2,
                      city: creditsCardCity,
                      state: creditsCardState,
                      pincode: creditsCardPincode,
                      taxId: creditsCardTaxId,
                      cardNumber: creditsCardNumber,
                      expiry: creditsCardExpiry,
                      cvc: creditsCardCvc,
                    },
                  });
                }, 100);
              }}>
                Pay ₹{Math.round(parseFloat(creditsAmount) * 95.65).toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Autonomous Credits Payment Summary — REMOVED, goes directly to Razorpay */}
      {false && showAutonomousSummary && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 40, maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Order Details</h2>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 20, marginTop: 20, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9em', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ opacity: 0.7 }}>Amount</div>
                <div style={{ fontWeight: 600 }}>${parseFloat(autonomousAmount).toFixed(2)}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9em', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <div style={{ opacity: 0.7 }}>Exchange rate</div>
                <div style={{ fontWeight: 600 }}>1 USD = ₹95.65</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '1em', fontWeight: 700 }}>
                <div>Total due today</div>
                <div>₹{Math.round(parseFloat(autonomousAmount) * 95.65).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div>ℹ️</div>
                <div>One-time purchase. Charged in Indian Rupees (INR) at the rate shown above.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowAutonomousSummary(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                setShowAutonomousSummary(false);
                setTimeout(() => {
                  const amount = parseFloat(autonomousAmount);
                  setCheckoutIntent({
                    kind: 'autonomousWorkCredits',
                    amountUsd: amount,
                    title: 'Autonomous Work Credits',
                    cardDetails: {
                      name: creditsCardName,
                      email: creditsCardEmail,
                      country: creditsCardCountry,
                      phone: creditsCardPhone,
                      address: creditsCardAddress,
                      address2: creditsCardAddress2,
                      city: creditsCardCity,
                      state: creditsCardState,
                      pincode: creditsCardPincode,
                      taxId: creditsCardTaxId,
                      cardNumber: creditsCardNumber,
                      expiry: creditsCardExpiry,
                      cvc: creditsCardCvc,
                    },
                  });
                }, 100);
              }}>
                Pay ₹{Math.round(parseFloat(autonomousAmount) * 95.65).toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-reload Modal */}
      {showAutoReloadModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Set auto-reload amount</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              When your usage credits run out, PawOS will automatically purchase this amount to keep you going.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount to auto-purchase</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  value={autoReloadAmount}
                  onChange={(e) => setAutoReloadAmount(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowAutoReloadModal(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={async () => {
                try {
                  const amount = parseFloat(autoReloadAmount);
                  if (Number.isFinite(amount) && amount >= 5 && amount <= 20000) {
                    await ipc.billingSetAutoReload(amount);
                    setAutoReloadEnabled(true);
                    setMessage(`Auto-reload enabled: $${amount.toFixed(2)} will be automatically charged when credits run out`);
                    setShowAutoReloadModal(false);
                  } else {
                    setMessage('Please enter a valid amount between $5 and $20,000.');
                  }
                } catch (err) {
                  setMessage(`Error enabling auto-reload: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}>
                Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 16px 0' }}>Invoices</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '8px 16px 8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Total</th>
                <th style={{ textAlign: 'left', padding: '8px 16px 8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 600, opacity: 0.6, fontSize: '0.85em', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cancellation */}
      <div style={{ paddingBottom: 0 }}>
        <h3 style={{ fontSize: '1em', fontWeight: 600, margin: '0 0 8px 0' }}>Cancellation</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '0.85em', opacity: 0.6, lineHeight: 1.5 }}>
          Cancel plan
        </p>
        <button type="button" disabled={currentTier === 'go'} style={{ padding: '8px 16px', backgroundColor: currentTier === 'go' ? '#999999' : '#d32f2f', color: 'white', border: 'none', borderRadius: 4, cursor: currentTier === 'go' ? 'not-allowed' : 'pointer', fontSize: '0.9em', fontWeight: 500, opacity: currentTier === 'go' ? 0.5 : 1 }} onClick={() => {
          if (confirm('Are you sure you want to cancel your subscription? You will lose access to all paid features.')) {
            downgrade('go');
          }
        }} title={currentTier === 'go' ? 'Already on Go plan' : ''}>
          Cancel
        </button>
      </div>

      {message && <p style={{ margin: '16px 0 0 0', opacity: 0.8, fontSize: '0.9em', color: '#4cb050' }}>{message}</p>}
    </div>

    {checkoutIntent && <NativeBillingCheckoutModal intent={checkoutIntent} onClose={() => setCheckoutIntent(null)} />}
    </>
  );
}
