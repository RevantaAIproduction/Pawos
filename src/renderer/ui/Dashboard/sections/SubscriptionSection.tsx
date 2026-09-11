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
  const [creditsCardTaxId, setCreditsCardTaxId] = useState('');
  const [creditsCardNumber, setCreditsCardNumber] = useState('');
  const [creditsCardExpiry, setCreditsCardExpiry] = useState('');
  const [creditsCardCvc, setCreditsCardCvc] = useState('');
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
                backgroundColor: currentTier === 'proMax' ? '#404040' : '#606060',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: currentTier === 'proMax' ? 'pointer' : 'not-allowed',
                fontSize: '0.9em',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                opacity: currentTier === 'proMax' ? 1 : 0.5,
              }}
              disabled={currentTier !== 'proMax'}
              onClick={() => setShowAutonomousAmountModal(true)}
              onMouseEnter={(e) => {
                if (currentTier !== 'proMax') {
                  const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                  if (tooltip) tooltip.style.display = 'block';
                }
              }}
              onMouseLeave={(e) => {
                const tooltip = e.currentTarget.nextElementSibling as HTMLElement;
                if (tooltip) tooltip.style.display = 'none';
              }}
            >
              Buy credit
            </button>
            {currentTier !== 'proMax' && (
              <div style={{
                display: 'none',
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: 8,
                backgroundColor: 'rgba(0,0,0,0.95)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 4,
                fontSize: '0.85em',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                Upgrade to Pro Max to unlock
              </div>
            )}
          </div>
        </div>
      </div>

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

      {/* Credits Card Form Modal */}
      {showCreditsCardForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Enter card details</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Provide your card and billing information to complete the payment.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Full name <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="text" value={creditsCardName} onChange={(e) => setCreditsCardName(e.target.value)} placeholder="Your name" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Email</label>
                <input type="email" value={creditsCardEmail} onChange={(e) => setCreditsCardEmail(e.target.value)} placeholder="john@example.com" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Country or region <span style={{ color: '#d32f2f' }}>*</span></label>
                <select value={creditsCardCountry} onChange={(e) => setCreditsCardCountry(e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }}>
                  <option value="India" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>India</option>
                  <option value="United States" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United States</option>
                  <option value="United Kingdom" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United Kingdom</option>
                  <option value="Canada" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Canada</option>
                  <option value="Australia" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Australia</option>
                </select>
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 12, marginBottom: 4 }}>
                <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>Selected country</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '1em', fontWeight: 500 }}>{creditsCardCountry}</p>
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Phone number <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="tel" value={creditsCardPhone} onChange={(e) => setCreditsCardPhone(e.target.value)} placeholder="+1 (555) 123-4567" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Address line 1 <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="text" value={creditsCardAddress} onChange={(e) => setCreditsCardAddress(e.target.value)} placeholder="Start typing your address" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Business tax ID (Optional)</label>
                <input type="text" value={creditsCardTaxId} onChange={(e) => setCreditsCardTaxId(e.target.value)} placeholder="GST/Tax ID" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <h4 style={{ fontSize: '0.9em', fontWeight: 600, margin: '0 0 12px 0' }}>Payment method</h4>

                <div>
                  <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Card number</label>
                  <input type="text" value={creditsCardNumber} onChange={(e) => setCreditsCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="1234 5678 9012 3456" maxLength={16} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box', letterSpacing: '2px' }} />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Expiration date</label>
                    <input type="text" value={creditsCardExpiry} onChange={(e) => {
                      let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      if (val.length >= 2) {
                        val = val.slice(0, 2) + '/' + val.slice(2);
                      }
                      setCreditsCardExpiry(val);
                    }} placeholder="MM/YY" maxLength={5} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Security code</label>
                    <input type="text" value={creditsCardCvc} onChange={(e) => setCreditsCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="CVC" maxLength={4} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500, color: '#fff', marginTop: 12 }}>
                <input type="checkbox" checked={creditsSaveCard} onChange={(e) => setCreditsSaveCard(e.target.checked)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
                <span>Save this card for future purchases</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCreditsCardForm(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                if (creditsCardName && creditsCardEmail && creditsCardCountry && creditsCardPhone && creditsCardAddress && creditsCardNumber && creditsCardExpiry && creditsCardCvc) {
                  setShowCreditsCardForm(false);
                  setTimeout(() => {
                    setShowCreditsSummary(true);
                  }, 100);
                } else {
                  setMessage('Please fill in all required fields.');
                }
              }}>
                Save payment method
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

      {/* Autonomous Ticket Credit Card Form Modal */}
      {showAutonomousCardForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Enter card details</h2>
            <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
              Provide your card and billing information to complete the payment.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Full name <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="text" placeholder="Your name" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Email</label>
                <input type="email" placeholder="john@example.com" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Country or region <span style={{ color: '#d32f2f' }}>*</span></label>
                <select style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }}>
                  <option value="India" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>India</option>
                  <option value="United States" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United States</option>
                  <option value="United Kingdom" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United Kingdom</option>
                  <option value="Canada" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Canada</option>
                  <option value="Australia" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Australia</option>
                </select>
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 12, marginBottom: 4 }}>
                <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>Selected country</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '1em', fontWeight: 500 }}>India</p>
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Phone number <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="tel" placeholder="+1 (555) 123-4567" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Address line 1 <span style={{ color: '#d32f2f' }}>*</span></label>
                <input type="text" placeholder="Start typing your address" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Business tax ID (Optional)</label>
                <input type="text" placeholder="GST/Tax ID" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <h4 style={{ fontSize: '0.9em', fontWeight: 600, margin: '0 0 12px 0' }}>Payment method</h4>

                <div>
                  <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Card number</label>
                  <input type="text" placeholder="1234 5678 9012 3456" maxLength={16} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box', letterSpacing: '2px' }} />
                </div>

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Expiration date</label>
                    <input type="text" placeholder="MM/YY" maxLength={5} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Security code</label>
                    <input type="text" placeholder="CVC" maxLength={4} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowAutonomousCardForm(false)}>
                Cancel
              </button>
              <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
                setShowAutonomousCardForm(false);
                setTimeout(() => {
                  setShowAutonomousSummary(true);
                }, 100);
              }}>
                Save payment method
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage Credits Payment Summary */}
      {showCreditsSummary && (
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
                  setCheckoutIntent({ kind: 'usageCredits', amountUsd: amount, title: 'Buy Usage Credits' });
                }, 100);
              }}>
                Pay ₹{Math.round(parseFloat(creditsAmount) * 95.65).toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Autonomous Credits Payment Summary */}
      {showAutonomousSummary && (
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
                  setCheckoutIntent({ kind: 'autonomousWorkCredits', amountUsd: amount, title: 'Autonomous Work Credits' });
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
