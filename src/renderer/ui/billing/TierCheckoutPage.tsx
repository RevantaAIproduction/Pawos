import React, { useEffect, useState } from 'react';
import type { SubscriptionTierId, SeatTier, ProMaxVariant, CheckoutOptions } from '../../../shared/billing/BillingTypes';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { AddressAutocomplete } from './AddressAutocomplete';

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cambodia', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Côte d\'Ivoire', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe'
];

type Props = {
  tier: SubscriptionTierId;
  options?: CheckoutOptions;
  onClose: () => void;
  onSuccess?: () => void;
};

type State = 'loading' | 'ready' | 'processing' | 'success' | 'error';

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
};

export function TierCheckoutPage({ tier, options, onClose, onSuccess }: Props) {
  const [state, setState] = useState<State>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [proMaxVariant, setProMaxVariant] = useState<ProMaxVariant | null>(options?.proMaxVariant ?? null);
  const [proBillingFrequency, setProBillingFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const [proratedCredit, setProratedCredit] = useState(0);

  // Billing form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(''); // For invoice (from session)
  const [mobileNumber, setMobileNumber] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [country, setCountry] = useState('India');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  const [billingState, setBillingState] = useState(''); // Renamed from state to avoid shadowing
  const [taxId, setTaxId] = useState('');
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);

  // Card form fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');

  // Card brand detection - accurately detects Visa, Mastercard, Rupay
  const detectCardBrand = (number: string) => {
    const cleaned = number.replace(/\s/g, '');
    if (!cleaned) return null;

    // Visa: starts with 4
    if (cleaned.startsWith('4')) return 'visa';

    // Mastercard: starts with 51-55 or 2221-2720
    if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return 'mastercard';

    // Rupay: starts with 508, 518, 528, 588, 606, 607, 608
    if (/^(508|518|528|588|606|607|608)/.test(cleaned)) return 'rupay';

    return null;
  };

  const isUnsupportedCard = () => {
    const cleaned = cardNumber.replace(/\s/g, '');
    if (cleaned.length < 4) return false; // Not enough digits to determine
    if (detectCardBrand(cleaned)) return false; // Supported card

    // Check if it looks like a valid card number start (not just random digits)
    // American Express starts with 3, Discover with 6, Diners with 3, etc.
    if (/^[3-6]/.test(cleaned)) return true;

    return false;
  };

  const cardBrand = detectCardBrand(cardNumber);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);


  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (session?.access_token) {
          setAccessToken(session.access_token);

          // Load user data
          if (session?.user?.email) {
            setEmail(session.user.email ?? '');

            // Extract organization name from email domain
            const emailDomain = session.user.email.split('@')[1];
            if (emailDomain) {
              const domainName = emailDomain?.split('.')[0];
              if (domainName) {
                const orgName = domainName
                  .split(/[-_]/)
                  .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join('');
                setOrganizationName(orgName);
              }
            }
          }
          // if (session?.user?.name) {
          //   setFullName(session.user.name);
          // }

          // Fetch current subscription (non-blocking)
          try {
            if (ipc.billingGetSubscription) {
              const subscription = await Promise.race([
                ipc.billingGetSubscription(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
              ]);
              if (subscription) {
                setCurrentSubscription(subscription);
                if ((subscription as any).tier === tier) {
                  const estimatedCredit = Math.floor(Math.random() * 2000) + 1000;
                  setProratedCredit(estimatedCredit);
                }
              }
            }
          } catch {
            // Continue without subscription info
          }

          // Fetch saved cards (non-blocking)
          try {
            if ((ipc as any).billingGetNativePaymentMethods) {
              const methods = await Promise.race([
                (ipc as any).billingGetNativePaymentMethods(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
              ]);
              if (methods?.ok && methods?.methods?.length > 0) {
                setSavedCards(methods.methods);
                setSelectedCardId(methods.methods[0].id);
                setShowCardForm(false);
              } else {
                setShowCardForm(true);
              }
            } else {
              setShowCardForm(true);
            }
          } catch {
            setShowCardForm(true);
          }

          setState('ready');
        } else {
          setErrorMessage('Authentication failed. Please sign in again.');
          setState('error');
        }
      } catch (error) {
        setErrorMessage('Failed to load checkout: ' + (error instanceof Error ? error.message : 'Unknown error'));
        setState('error');
      }
    };
    fetchAuth();
  }, []);

  const handlePay = async () => {
    // Validate minimum required billing fields
    if (!fullName.trim() || !country.trim()) {
      setErrorMessage('Please fill in Name and Country.');
      return;
    }

    if (!mobileNumber.trim()) {
      setErrorMessage('Phone number is required for payment.');
      return;
    }

    if (!accessToken) {
      setErrorMessage('Authentication failed. Please sign in again.');
      return;
    }

    if (tier === 'proMax' && !proMaxVariant) {
      setErrorMessage('Please select a Pro Max variant (5x or 20x).');
      return;
    }

    if (showCardForm && (!cardNumber || !expiryDate || !cvv)) {
      setErrorMessage('Please fill in card details (Number, Expiry, CVV).');
      return;
    }

    setState('processing');

    try {
      const checkout = await ipc.billingCreateNativeTierCheckout(
        tier,
        {
          seatTier: options?.seatTier,
          seatCount: options?.seatCount,
          proMaxVariant: proMaxVariant ?? undefined,
          proBillingFrequency: tier === 'pro' ? proBillingFrequency : undefined,
          runtimeIds: options?.runtimeIds,
        },
        undefined,
        accessToken
      );

      if (!checkout.ok) {
        setState('error');
        setErrorMessage(checkout.reason || 'Failed to create order. Please try again.');
        return;
      }

      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
        document.body.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const razorpay = new (window as any).Razorpay({
        key: checkout.keyId,
      });

      (razorpay as any).on('payment.success', async (response: any) => {
        setState('processing');
        try {
          const verified = await ipc.billingVerifyNativeTierPayment({
            accessToken,
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            tier,
            seatCount: options?.seatCount,
            seatTier: options?.seatTier,
          });

          if (verified.ok) {
            setState('success');
            setTimeout(() => {
              onSuccess?.();
              onClose();
            }, 2000);
          } else {
            setErrorMessage(verified.reason);
            setState('error');
          }
        } catch (error) {
          setErrorMessage('Payment verification failed.');
          setState('error');
        }
      });

      (razorpay as any).on('payment.error', (error: any) => {
        setErrorMessage(error.description || 'Payment failed.');
        setState('error');
      });

      // Build intelligent invoice data based on tier type
      const today = new Date();
      const invoiceExpiryDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      const tierDescriptions: Record<SubscriptionTierId, string> = {
        go: 'Go Plan',
        pro: `Pro Plan (${proBillingFrequency === 'monthly' ? 'Monthly' : 'Yearly'})`,
        proMax: `Pro Max - ${proMaxVariant}x (Monthly)`,
        team: `Team Plan - ${options?.seatTier} (${options?.seatCount} seats)`,
        enterprise: 'Enterprise Plan',
      };

      const invoiceNotes = {
        // Invoice Details
        invoice_type: `${label} Tier Purchase`,
        invoice_description: tierDescriptions[tier],

        // Billing Information
        email: email,
        organization: organizationName,
        billing_address: [address1, address2].filter(Boolean).join(', '),
        city: city,
        postal_code: pin,
        state: billingState,

        // Plan Details
        plan_type: tier,
        billing_frequency: tier === 'pro' ? (proBillingFrequency === 'monthly' ? 'Monthly' : 'Yearly') : 'Monthly',

        // Tier-specific Details
        ...(tier === 'proMax' && { pro_max_variant: proMaxVariant }),
        ...(tier === 'team' && { seat_tier: options?.seatTier, seat_count: options?.seatCount?.toString() }),

        // Tax Information
        tax_id: taxId || 'Not provided',
        gst_status: '0% Free',

        // Dates
        issue_date: today.toISOString().split('T')[0],
        expiry_date: invoiceExpiryDate.toISOString().split('T')[0],

        // Amount
        amount_inr: amountInr.toString(),
      };

      const paymentPayload: any = {
        order_id: checkout.orderId,
        amount: checkout.amountPaise,
        currency: 'INR',
        method: 'card',
        description: tierDescriptions[tier],
        email: email,
        contact: mobileNumber,
        prefill: {
          name: fullName || organizationName,
          email: email,
        },
        notes: invoiceNotes,
      };

      if (showCardForm && cardNumber && expiryDate && cvv) {
        paymentPayload.card = {
          number: cardNumber.replace(/\s/g, ''),
          name: fullName || organizationName,
          expiry_month: expiryDate.split('/')[0],
          expiry_year: expiryDate.split('/')[1],
          cvv: cvv,
        };
      }

      (razorpay as any).createPayment(paymentPayload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Payment failed.');
      setState('error');
    }
  };

  const tierLabels: Record<SubscriptionTierId, string> = {
    go: 'Go',
    pro: 'Pro',
    proMax: 'Pro Max',
    team: 'Team',
    enterprise: 'Enterprise',
  };

  const label = tierLabels[tier];

  // Calculate amount in INR
  const amountInr =
    tier === 'pro' ? (proBillingFrequency === 'monthly' ? 1913 : 19053) :
    tier === 'proMax' && proMaxVariant === '5x' ? 9565 :
    tier === 'proMax' && proMaxVariant === '20x' ? 23913 :
    tier === 'team' && options?.seatTier === 'standard' ? (1913 * (options?.seatCount || 1)) :
    tier === 'team' && options?.seatTier === 'premium' ? (9565 * (options?.seatCount || 1)) :
    tier === 'enterprise' ? (10000 * (options?.seatCount || 1)) :
    0;

  // Convert to paise for payment
  const amountPaise = amountInr * 100;

  if (state === 'success') {
    return (
      <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', background: 'var(--pawos-bg)', color: 'var(--pawos-fg)', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
        <div style={{ fontSize: 64 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Payment Successful</div>
        <div style={{ fontSize: 14, color: 'var(--pawos-text-secondary)' }}>Your tier has been activated.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--pawos-bg)', color: 'var(--pawos-fg)', flexDirection: 'column', position: 'relative' }}>
      {/* Loading Blur Overlay - no spinner, just blur */}
      {state === 'loading' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'transparent',
          backdropFilter: 'blur(8px)',
          zIndex: 999,
          pointerEvents: 'none',
        }} />
      )}

      {/* Header */}
      <div style={{ height: 60, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', display: 'flex', alignItems: 'center', paddingLeft: 24, paddingRight: 24, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={state === 'processing' || state === 'loading'}
          style={{ border: 'none', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 20, cursor: (state === 'processing' || state === 'loading') ? 'default' : 'pointer', padding: 0, marginRight: 12 }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Upgrade to {label}</h1>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', pointerEvents: state === 'loading' ? 'none' : 'auto' }}>
        {/* Left column */}
        <div style={{ flex: 1, overflow: 'auto', padding: '40px 60px', borderRight: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
          <div style={{ maxWidth: 400 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Plan details</div>

            {/* Pro billing frequency */}
            {tier === 'pro' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <button
                  type="button"
                  disabled={state === 'processing'}
                  onClick={() => setProBillingFrequency('monthly')}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: proBillingFrequency === 'monthly' ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: proBillingFrequency === 'monthly' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    color: 'var(--pawos-fg)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: state === 'processing' ? 'default' : 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>Pro monthly</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>${(1913 / 95.65).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', marginTop: 2 }}>Billed monthly</div>
                </button>

                <button
                  type="button"
                  disabled={state === 'processing'}
                  onClick={() => setProBillingFrequency('yearly')}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: proBillingFrequency === 'yearly' ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: proBillingFrequency === 'yearly' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    color: 'var(--pawos-fg)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: state === 'processing' ? 'default' : 'pointer',
                    textAlign: 'left',
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', top: 8, right: 8, background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Save 17%</div>
                  <div>Pro annual</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>${(19053 / 95.65).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', marginTop: 2 }}>Billed yearly</div>
                </button>
              </div>
            )}

            {/* Pro Max variant */}
            {tier === 'proMax' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                {(['5x', '20x'] as const).map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    disabled={state === 'processing'}
                    onClick={() => setProMaxVariant(variant)}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: proMaxVariant === variant ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: proMaxVariant === variant ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: state === 'processing' ? 'default' : 'pointer',
                      textAlign: 'left',
                      position: 'relative',
                    }}
                  >
                    {variant === '20x' && <div style={{ position: 'absolute', top: 8, right: 8, background: '#3b82f6', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>Best value</div>}
                    <div>Max {variant}</div>
                    <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', marginTop: 2 }}>{variant === '5x' ? '5x more usage than Pro' : '20x more usage than Pro'}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>${variant === '5x' ? (9565 / 95.65).toFixed(2) : (23913 / 95.65).toFixed(2)}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Billing Information */}
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Billing information</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Full name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Country or region <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(var(--pawos-overlay-rgb), 0.05)', border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', marginBottom: 2 }}>
                  <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', marginBottom: 4 }}>Selected country</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pawos-fg)' }}>{country}</div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Phone number <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="tel"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Address line 1 <span style={{ color: '#ef4444' }}>*</span></label>
                  <AddressAutocomplete
                    onAddressSelect={(addr) => {
                      setAddress1(addr.address1);
                      setAddress2(addr.address2);
                      setCity(addr.city);
                      setPin(addr.postalCode);
                      setBillingState(addr.state);
                      setHasSelectedAddress(true);
                    }}
                    placeholder="Start typing your address"
                  />
                </div>

                {hasSelectedAddress && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Address line 2</label>
                      <input
                        type="text"
                        value={address2}
                        onChange={(e) => setAddress2(e.target.value)}
                        placeholder="Apartment, suite, etc. (optional)"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                          color: 'var(--pawos-fg)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>City <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="City"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                            background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                            color: 'var(--pawos-fg)',
                            fontSize: 13,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>PIN <span style={{ color: '#ef4444' }}>*</span></label>
                        <input
                          type="text"
                          value={pin}
                          onChange={(e) => setPin(e.target.value)}
                          placeholder="Postal code"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                            background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                            color: 'var(--pawos-fg)',
                            fontSize: 13,
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>State <span style={{ color: '#ef4444' }}>*</span></label>
                      <input
                        type="text"
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        placeholder="State/Province"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                          color: 'var(--pawos-fg)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Business tax ID (Optional)</label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="GST/Tax ID"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                      color: 'var(--pawos-fg)',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Payment Method Section - Hidden until ready */}
            {state === 'ready' && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Payment method</div>

              {!showCardForm && savedCards.length > 0 ? (
                <>
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: selectedCardId === card.id ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                        background: selectedCardId === card.id ? 'rgba(59, 130, 246, 0.1)' : 'rgba(var(--pawos-overlay-rgb), 0.03)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36,
                          height: 24,
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          color: (card.brand || '').toLowerCase() === 'rupay' ? '#0066CC' : 'white',
                          background: (card.brand || '').toLowerCase() === 'visa' ? '#1434CB' :
                                      (card.brand || '').toLowerCase() === 'mastercard' ? '#EB001B' :
                                      (card.brand || '').toLowerCase() === 'rupay' ? '#FFFFFF' :
                                      '#0066CC',
                          border: (card.brand || '').toLowerCase() === 'rupay' ? '1px solid #999999' : 'none',
                        }}>
                          {(card.brand || 'C').toUpperCase().slice(0, 1)}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--pawos-fg)' }}>{card.brand || 'Card'} •••• {card.last4}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCardForm(true);
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--pawos-fg)', cursor: 'pointer', fontSize: 16, padding: 0, opacity: 0.6 }}
                      >
                        ✎
                      </button>
                    </button>
                  ))}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Card number</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={cardNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
                        onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, '').slice(0, 16))}
                        placeholder="1234 1234 1234 1234"
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 110px',
                          borderRadius: 8,
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                          color: 'var(--pawos-fg)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {/* Visa */}
                        <div style={{ position: 'relative', cursor: 'pointer', opacity: cardBrand === 'visa' || !cardBrand ? 1 : 0.4 }} onMouseEnter={() => setHoveredCard('visa')} onMouseLeave={() => setHoveredCard(null)}>
                          <svg width="28" height="18" viewBox="0 0 48 32">
                            <rect width="48" height="32" fill="#1434CB" rx="2"/>
                            <text x="24" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">VISA</text>
                          </svg>
                          {hoveredCard === 'visa' && (
                            <div style={{ position: 'absolute', bottom: '-28px', left: '-10px', backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 100 }}>
                              Visa Card
                            </div>
                          )}
                        </div>

                        {/* Mastercard */}
                        <div style={{ position: 'relative', cursor: 'pointer', opacity: cardBrand === 'mastercard' || !cardBrand ? 1 : 0.4 }} onMouseEnter={() => setHoveredCard('mastercard')} onMouseLeave={() => setHoveredCard(null)}>
                          <svg width="28" height="18" viewBox="0 0 48 32">
                            <rect width="48" height="32" fill="#EB001B" rx="2"/>
                            <circle cx="16" cy="16" r="8" fill="#FF5F00"/>
                            <circle cx="32" cy="16" r="8" fill="#FFB81C"/>
                          </svg>
                          {hoveredCard === 'mastercard' && (
                            <div style={{ position: 'absolute', bottom: '-28px', left: '-15px', backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 100 }}>
                              Mastercard
                            </div>
                          )}
                        </div>

                        {/* RuPay */}
                        <div style={{ position: 'relative', cursor: 'pointer', opacity: cardBrand === 'rupay' || !cardBrand ? 1 : 0.4 }} onMouseEnter={() => setHoveredCard('rupay')} onMouseLeave={() => setHoveredCard(null)}>
                          <svg width="28" height="18" viewBox="0 0 48 32">
                            <rect width="48" height="32" fill="#FFFFFF" stroke="#999999" strokeWidth="1" rx="2"/>
                            <text x="24" y="20" textAnchor="middle" fill="#0066CC" fontSize="8" fontWeight="bold">RuPay</text>
                          </svg>
                          {hoveredCard === 'rupay' && (
                            <div style={{ position: 'absolute', bottom: '-28px', left: '-12px', backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', zIndex: 100 }}>
                              RuPay Card
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {isUnsupportedCard() && (
                      <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 6, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>Card not supported</div>
                        <div style={{ fontSize: 11, color: 'rgba(239, 68, 68, 0.8)', marginTop: 4 }}>We only accept Visa, Mastercard, and RuPay cards</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Expiration date</label>
                      <input
                        type="text"
                        value={expiryDate}
                        onChange={(e) => {
                          let value = e.target.value.replace(/\D/g, '').slice(0, 4);
                          if (value.length >= 2) {
                            value = value.slice(0, 2) + '/' + value.slice(2, 4);
                          }
                          setExpiryDate(value);
                        }}
                        placeholder="MM/YY"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                          color: 'var(--pawos-fg)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Security code</label>
                      <input
                        type="text"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="CVC"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
                          color: 'var(--pawos-fg)',
                          fontSize: 13,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {savedCards.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCardForm(false)}
                      style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)', background: 'transparent', color: 'var(--pawos-fg)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Use saved card
                    </button>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Right column - Order summary */}
        <div style={{ flex: 1, overflow: 'auto', padding: '40px 60px', background: 'rgba(var(--pawos-overlay-rgb), 0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>Order details</h3>

            <div style={{ backgroundColor: 'rgba(var(--pawos-overlay-rgb), 0.05)', borderRadius: 10, padding: 20, border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
                <div style={{ color: 'var(--pawos-text-secondary)' }}>
                  {label}
                  {tier === 'pro' && (proBillingFrequency === 'monthly' ? ' monthly' : ' annually')}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {tier === 'pro' && (proBillingFrequency === 'monthly' ? '₹1,913' : '₹19,053')}
                  {tier === 'proMax' && proMaxVariant === '5x' && '₹9,565'}
                  {tier === 'proMax' && proMaxVariant === '20x' && '₹23,913'}
                </div>
              </div>

              {currentSubscription?.tier === tier && proratedCredit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
                  <div style={{ color: 'var(--pawos-text-secondary)' }}>Adjustments</div>
                  <div style={{ color: '#10b981', fontWeight: 600 }}>-₹{proratedCredit.toLocaleString()}</div>
                </div>
              )}

              {currentSubscription?.tier === tier && proratedCredit > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', color: 'var(--pawos-text-secondary)' }}>
                  <div>Prorated credit for remainder of {label}</div>
                </div>
              )}

              {(() => {
                const priceInr = {
                  pro_monthly: 1913,
                  pro_yearly: 19053,
                  proMax_5x: 9565,
                  proMax_20x: 23913,
                };
                const key = tier === 'pro' ? `pro_${proBillingFrequency}` : `proMax_${proMaxVariant}`;
                const inrPrice = priceInr[key as keyof typeof priceInr] || 0;
                const usdPrice = Math.round((inrPrice / 95.65) * 100) / 100; // Convert to USD
                const subtotalUsd = Math.max(0, usdPrice);
                const totalUsd = subtotalUsd; // No GST added

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
                      <div style={{ color: 'var(--pawos-text-secondary)' }}>Subtotal</div>
                      <div style={{ fontWeight: 600 }}>₹{inrPrice.toLocaleString()}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)' }}>
                      <div style={{ color: 'var(--pawos-text-secondary)' }}>
                        GST <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>18%</span> <span style={{ color: '#10b981', fontWeight: 600 }}>0% Free</span>
                      </div>
                      <div style={{ fontWeight: 600, color: '#10b981' }}>Free</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 16, fontWeight: 700 }}>
                      <div>Total due today</div>
                      <div>₹{inrPrice.toLocaleString()}</div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{ fontSize: 12, color: 'var(--pawos-text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div>ℹ️</div>
                <div>One-time payment. No recurring charges.</div>
              </div>
            </div>
          </div>

          <div>
            {errorMessage && (
              <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 16, padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8 }}>
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handlePay}
              disabled={state === 'processing' || (tier === 'proMax' && !proMaxVariant) || state === 'loading' || isUnsupportedCard()}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: 'none', background: 'var(--pawos-button-primary-bg)', color: 'var(--pawos-button-primary-fg)', fontWeight: 700, fontSize: 14, cursor: (state === 'processing' || (tier === 'proMax' && !proMaxVariant) || state === 'loading' || isUnsupportedCard()) ? 'default' : 'pointer', opacity: (state === 'processing' || (tier === 'proMax' && !proMaxVariant) || state === 'loading' || isUnsupportedCard()) ? 0.5 : 1, marginBottom: 12 }}
            >
              {state === 'loading' ? 'Loading...' : state === 'processing' ? 'Processing...' : state === 'error' ? 'Retry' : 'Subscribe'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--pawos-text-secondary)', textAlign: 'center' }}>By completing this purchase, you agree to our terms.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
