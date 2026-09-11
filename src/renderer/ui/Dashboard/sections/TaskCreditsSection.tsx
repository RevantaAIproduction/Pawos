import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../../organization/AutonomousTaskBillingService';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../../billing/NativeBillingCheckoutModal';
import { MIN_TICKET_BALANCE_TOPUP_USD, MAX_TICKET_BALANCE_TOPUP_USD, TICKET_BALANCE_TOPUP_PRESETS_USD, TICKET_PRICING_TIERS, getTicketUnitPriceUsd } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { OrganizationBillingEvent, TicketBalance, TicketBalanceTopup } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { SubscriptionTierId, TicketPricingConfig } from '../../../../shared/billing/BillingTypes';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#e8e8ec',
  padding: '8px 10px',
  fontSize: 13,
  width: 90,
};

/**
 * Individual-account (non-organization) equivalent of
 * AutonomousTaskBillingCard.tsx — same dollar-denominated Ticket Balance
 * wallet, scoped to the signed-in user's own personal balance
 * (organizationId: null) instead of an organization's. Team/Enterprise
 * members see the org-scoped card inside Organization settings instead;
 * this card is for a Pro/Pro Max individual account.
 */
export function TaskCreditsSection({ user }: { user: AuthUser }) {
  const [tier, setTier] = useState<SubscriptionTierId | null>(null);
  const [balance, setBalance] = useState<TicketBalance | null>(null);
  const [topups, setTopups] = useState<TicketBalanceTopup[]>([]);
  const [events, setEvents] = useState<OrganizationBillingEvent[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Seeded from the shared code defaults, then replaced by the real, editable config the moment
  // it loads — see TicketPricingConfigStore.ts for why the presets/minimum aren't hardcoded here.
  const [pricingConfig, setPricingConfig] = useState<TicketPricingConfig>({
    topupPresetsUsd: [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD,
    maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD,
  });
  const [amountInput, setAmountInput] = useState(String(TICKET_BALANCE_TOPUP_PRESETS_USD[0]));
  const [busy, setBusy] = useState(false);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardEmail, setCardEmail] = useState('');
  const [cardCountry, setCardCountry] = useState('India');
  const [cardPhone, setCardPhone] = useState('');
  const [cardAddress, setCardAddress] = useState('');
  const [cardTaxId, setCardTaxId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [saveCard, setSaveCard] = useState(false);
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);

  function reload() {
    if (user.isGuest) {
      setLoading(false);
      return;
    }
    Promise.all([
      ipc.billingGetSubscription(),
      ipc.billingGetTicketPricingConfig(),
      autonomousTaskBillingService.getTicketBalance(null),
      autonomousTaskBillingService.listTopups(null, 100),
      autonomousTaskBillingService.listBillingHistory(null, 200),
      autonomousTaskBillingService.listRecentRuns(null, 200),
    ])
      .then(([subscription, ticketPricing, ticketBalance, ticketTopups, billingHistory, recentRuns]) => {
        setTier(subscription.tier);
        setPricingConfig(ticketPricing);
        setBalance(ticketBalance);
        setTopups(ticketTopups);
        setEvents(billingHistory);
        setTotalCompleted(recentRuns.filter((r) => r.status === 'completed').length);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [user.isGuest]);

  useEffect(() => {
    if (user.isGuest) return;
    ipc.onTaskCreditsPurchased(() => reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isGuest]);

  async function addFunds() {
    const parsed = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed < pricingConfig.minTopupUsd) {
      setError(`Minimum top-up is $${pricingConfig.minTopupUsd}.`);
      return;
    }
    if (parsed > pricingConfig.maxTopupUsd) {
      setError(`Maximum top-up is $${pricingConfig.maxTopupUsd.toLocaleString()}.`);
      return;
    }
    setError(null);
    setMessage(null);
    setBusy(false);
    setShowAmountModal(false);
    setTimeout(() => {
      setShowCardForm(true);
    }, 100);
  }

  if (user.isGuest) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  if (tier === 'team' || tier === 'enterprise') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Ticket System</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Your organization manages one shared Ticket Balance for every member — go to{' '}
          <strong>Organization → Credits &amp; Billing</strong> to view or add funds, rather than a
          separate personal balance here.
        </p>
      </div>
    );
  }

  if (tier !== 'pro' && tier !== 'proMax') {
    return null;
  }

  const balanceUsd = balance?.balanceUsd ?? 0;

  if (tier !== 'pro' && tier !== 'proMax') {
    return null;
  }

  return (
    <>
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '1em', fontWeight: 600, margin: 0 }}>Autonomous Ticket Credit</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85em', opacity: 0.6 }}>Current balance: ${balanceUsd.toFixed(2)}</p>
        </div>
        <button type="button" style={{ padding: '8px 16px', backgroundColor: tier === 'proMax' ? '#404040' : '#606060', color: '#fff', border: 'none', borderRadius: 4, cursor: tier === 'proMax' ? 'pointer' : 'not-allowed', fontSize: '0.9em', fontWeight: 500, whiteSpace: 'nowrap', opacity: tier === 'proMax' ? 1 : 0.5 }} disabled={tier !== 'proMax'} onClick={() => setShowAmountModal(true)}>
          {busy ? 'Opening checkout…' : 'Buy credit'}
        </button>
      </div>
    </div>

    {/* Card Form Modal */}
    {showCardForm && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Enter card details</h2>
          <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Provide your card and billing information to complete the payment.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Full name <span style={{ color: '#d32f2f' }}>*</span></label>
              <input type="text" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Your name" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Email</label>
              <input type="email" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="john@example.com" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Country or region <span style={{ color: '#d32f2f' }}>*</span></label>
              <select value={cardCountry} onChange={(e) => setCardCountry(e.target.value)} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }}>
                <option value="India" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>India</option>
                <option value="United States" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United States</option>
                <option value="United Kingdom" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>United Kingdom</option>
                <option value="Canada" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Canada</option>
                <option value="Australia" style={{ backgroundColor: '#1a1a1e', color: '#fff' }}>Australia</option>
              </select>
            </div>

            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: 12, marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>Selected country</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '1em', fontWeight: 500 }}>{cardCountry}</p>
            </div>

            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Phone number <span style={{ color: '#d32f2f' }}>*</span></label>
              <input type="tel" value={cardPhone} onChange={(e) => setCardPhone(e.target.value)} placeholder="+1 (555) 123-4567" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Address line 1 <span style={{ color: '#d32f2f' }}>*</span></label>
              <input type="text" value={cardAddress} onChange={(e) => setCardAddress(e.target.value)} placeholder="Start typing your address" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Business tax ID (Optional)</label>
              <input type="text" value={cardTaxId} onChange={(e) => setCardTaxId(e.target.value)} placeholder="GST/Tax ID" style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <h4 style={{ fontSize: '0.9em', fontWeight: 600, margin: '0 0 12px 0' }}>Payment method</h4>

              <div>
                <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Card number</label>
                <input type="text" value={cardNumber} onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="1234 5678 9012 3456" maxLength={16} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box', letterSpacing: '2px' }} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Expiration date</label>
                  <input type="text" value={cardExpiry} onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    if (val.length >= 2) {
                      val = val.slice(0, 2) + '/' + val.slice(2);
                    }
                    setCardExpiry(val);
                  }} placeholder="MM/YY" maxLength={5} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4, display: 'block' }}>Security code</label>
                  <input type="text" value={cardCvc} onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="CVC" maxLength={4} style={{ width: '100%', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '0.9em', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85em', fontWeight: 500, color: '#fff', marginTop: 12 }}>
              <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} style={{ cursor: 'pointer', width: 16, height: 16 }} />
              <span>Save this card for future purchases</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => setShowCardForm(false)}>
              Cancel
            </button>
            <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
              if (cardName && cardEmail && cardCountry && cardPhone && cardAddress && cardNumber && cardExpiry && cardCvc) {
                setShowCardForm(false);
                const parsed = parseFloat(amountInput);
                setTimeout(() => {
                  setCheckoutIntent({ kind: 'autonomousWorkCredits', amountUsd: parsed, title: 'Autonomous Work Credits' });
                }, 100);
              } else {
                setError('Please fill in all required fields.');
              }
            }}>
              Save payment method
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Amount Selection Modal */}
    {showAmountModal && (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ backgroundColor: '#1a1a1e', borderRadius: 8, padding: 32, maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <h2 style={{ fontSize: '1.2em', fontWeight: 700, margin: '0 0 8px 0' }}>Buy ticket credits</h2>
          <p style={{ fontSize: '0.9em', opacity: 0.7, margin: '0 0 20px 0', lineHeight: 1.5 }}>
            Enter the amount of ticket credits you want to purchase (${pricingConfig.minTopupUsd} - ${pricingConfig.maxTopupUsd.toLocaleString()}).
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8, display: 'block' }}>Amount (USD)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.1em', opacity: 0.8 }}>$</span>
              <input
                type="number"
                min={pricingConfig.minTopupUsd}
                max={pricingConfig.maxTopupUsd}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: '#fff', fontSize: '1em' }}
              />
            </div>
            {error && <p style={{ margin: '8px 0 0 0', fontSize: '0.85em', color: '#f44336' }}>{error}</p>}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#404040', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={() => {
              setShowAmountModal(false);
              setError(null);
            }}>
              Cancel
            </button>
            <button type="button" style={{ flex: 1, padding: '10px 16px', backgroundColor: '#1967D2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.9em', fontWeight: 500 }} onClick={addFunds}>
              Continue
            </button>
          </div>
        </div>
      </div>
    )}

    {checkoutIntent && (
      <NativeBillingCheckoutModal
        intent={checkoutIntent}
        onClose={() => setCheckoutIntent(null)}
        onSuccess={() => {
          setCheckoutIntent(null);
          setMessage('Payment verified. Your Ticket Balance has been updated.');
          reload();
        }}
      />
    )}
    </>
  );
}
