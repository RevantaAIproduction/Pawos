import React, { useEffect, useState } from 'react';
import type { SeatTier, CheckoutOptions } from '../../../shared/billing/BillingTypes';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../auth/supabaseClient';

type Props = {
  seatTier: SeatTier;
  onClose: () => void;
  onSuccess?: () => void;
};

type Step = 'teamName' | 'seats' | 'billing' | 'payment';

type SavedCard = {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
};

const USD_TO_INR = 95.65;

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

const MAX_TEAM_SEATS = 150;

const STATES_BY_COUNTRY: { [key: string]: string[] } = {
  'India': ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'],
  'United States': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'Canada': ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan'],
  'Australia': ['New South Wales', 'Queensland', 'South Australia', 'Tasmania', 'Victoria', 'Western Australia', 'Australian Capital Territory', 'Northern Territory'],
};

const SEAT_PRICING = {
  standard: {
    label: 'Standard seat',
    description: 'Best for most employees',
    priceUsd: 20,
  },
  premium: {
    label: 'Premium seat',
    description: '5x more usage than standard seats*',
    priceUsd: 100,
  },
};

export function TeamCheckoutPage({ seatTier, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('teamName');
  const [teamName, setTeamName] = useState('');
  const [organizationName, setOrganizationName] = useState(''); // Extracted from email domain
  const [billingFrequency, setBillingFrequency] = useState<'monthly' | 'annually'>('monthly');
  const [standardSeatCount, setStandardSeatCount] = useState(2); // Pre-fill with 2 standard seats
  const [premiumSeatCount, setPremiumSeatCount] = useState(0);

  // Billing form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [country, setCountry] = useState('India'); // Default to India
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);
  const [taxId, setTaxId] = useState('');
  const [useBusinessName, setUseBusinessName] = useState(false);

  // Card form fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [showCardForm, setShowCardForm] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [validationError, setValidationError] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'creating-invoice' | 'awaiting-payment' | 'processing' | 'confirming' | 'success'>('idle');

  // Calculate amounts
  const standardPriceInr = SEAT_PRICING.standard.priceUsd * USD_TO_INR; // $20 × 95.65 = ₹1,913
  const premiumPriceInr = SEAT_PRICING.premium.priceUsd * USD_TO_INR;   // $100 × 95.65 = ₹9,565

  const standardSubtotal = standardSeatCount * standardPriceInr;
  const premiumSubtotal = premiumSeatCount * premiumPriceInr;
  const subtotalInr = standardSubtotal + premiumSubtotal;

  // For annual: monthly × 12 (no discount applied to subtotal)
  const displaySubtotalInr = billingFrequency === 'annually' ? subtotalInr * 12 : subtotalInr;
  const gstAmount = displaySubtotalInr * 0.18;
  const totalInr = displaySubtotalInr + gstAmount;

  const cardBrand = detectCardBrand(cardNumber);

  function detectCardBrand(number: string) {
    const cleaned = number.replace(/\s/g, '');
    if (cleaned.startsWith('4')) return 'visa';
    if (/^5[1-5]|^2[2-7]/.test(cleaned)) return 'mastercard';
    if (/^[68]/.test(cleaned)) return 'rupay';
    return null;
  }

  const shouldShowBankTransfer = totalInr >= 50000;

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;

        // Set access token for API calls
        if (session?.access_token) {
          setAccessToken(session.access_token);
        }

        if (session?.user?.email) {
          // Auto-fill email
          setEmail(session.user.email);

          // Extract organization name from email domain
          // e.g., tharun@revantaai.com → RevantaAI
          const emailDomain = session.user.email.split('@')[1];
          if (emailDomain) {
            const domainName = emailDomain?.split('.')[0]; // Get part before .com/.io etc
            if (domainName) {
              const orgName = domainName
                .split(/[-_]/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');
              setOrganizationName(orgName);
              setTeamName(orgName); // Prefill team name with organization name (user can change)
            }
          }
        }

        // Auto-fill phone from user metadata if available
        if (session?.user?.user_metadata?.phone) {
          setMobileNumber(session.user.user_metadata.phone);
        }

        // if (session?.user?.name) {
        //   setFullName(session.user.name);
        // }

        // Try to extract organization name from organization or team data (backup)
        try {
          const orgData = await (ipc as any).organizationGetCurrent?.();
          if (orgData?.name) {
            setOrganizationName(orgData.name);
            setTeamName(orgData.name);
          }
        } catch {
          // Organization data not available, use email domain extraction
        }
      } catch {
        // Continue without pre-fill
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    const fetchSavedCards = async () => {
      try {
        const methods = await (ipc as any).billingGetNativePaymentMethods?.();
        if (methods?.ok && Array.isArray(methods.methods)) {
          setSavedCards(methods.methods);
          if (methods.methods.length > 0) {
            setSelectedCardId(methods.methods[0].id);
          } else {
            setShowCardForm(true);
          }
        } else {
          setShowCardForm(true);
        }
      } catch {
        setShowCardForm(true);
      }
    };

    if (step === 'payment') {
      fetchSavedCards();
    }
  }, [step]);

  const handlePayment = async () => {
    setProcessing(true);
    setErrorMessage('');

    try {
      if (!fullName || !address1 || !city || !billingState || !postalCode) {
        setErrorMessage('Please fill in all required billing information including address');
        setProcessing(false);
        return;
      }

      const checkoutOptions: CheckoutOptions = {
        seatTier: 'standard',
        seatCount: standardSeatCount + premiumSeatCount,
      };

      if (!accessToken) {
        setErrorMessage('Session expired. Please sign in again.');
        setProcessing(false);
        return;
      }

      const result = await ipc.billingCreateNativeTierCheckout('team', checkoutOptions, undefined, accessToken);

      if (!result.ok) {
        setErrorMessage(result.reason || 'Payment failed');
        setProcessing(false);
        return;
      }

      const { orderId, amountPaise } = result;

      // Load Razorpay script if not already loaded
      let razorpay = (window as any).Razorpay;
      if (!razorpay) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/razorpay.js';
          script.onload = () => {
            razorpay = (window as any).Razorpay;
            if (razorpay) {
              resolve(true);
            } else {
              reject(new Error('Razorpay failed to load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load Razorpay script'));
          document.body.appendChild(script);
        });
      }

      if (!razorpay) {
        setErrorMessage('Payment gateway unavailable');
        setProcessing(false);
        return;
      }

      // Build intelligent invoice data for Razorpay
      const today = new Date();
      const expiryDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
      const invoiceNumber = `INV-${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;

      const invoiceDescription = `${organizationName || teamName} - Team Plan (${billingFrequency === 'annually' ? 'Annual' : 'Monthly'})`;

      const lineItems = [
        standardSeatCount > 0 && {
          description: `Standard Seats (${standardSeatCount} × $20/month)`,
          amount: (standardSeatCount * 1913 * (billingFrequency === 'annually' ? 12 : 1)) / 100,
          quantity: standardSeatCount,
        },
        premiumSeatCount > 0 && {
          description: `Premium Seats (${premiumSeatCount} × $100/month)`,
          amount: (premiumSeatCount * 9565 * (billingFrequency === 'annually' ? 12 : 1)) / 100,
          quantity: premiumSeatCount,
        },
      ].filter(Boolean);

      const customerNotes = `Team Plan Purchase\n\nOrganization: ${organizationName || teamName}\nTeam Name: ${teamName}\nBilling Type: ${billingFrequency === 'annually' ? 'Annual' : 'Monthly'}\nPayment Method: ${shouldShowBankTransfer ? 'Bank Transfer' : 'Card'}\n\nSeat Configuration:\n- Standard Seats: ${standardSeatCount}\n- Premium Seats: ${premiumSeatCount}\n\nYour plan will be activated upon successful payment.`;

      const termsAndConditions = `Terms and Conditions:\n\n1. Payment Terms: ${shouldShowBankTransfer ? 'Bank transfer must be completed within 7 days' : 'Card payment is processed immediately'}\n2. Plan Activation: ${shouldShowBankTransfer ? '1-5 business days after payment clearance' : 'Immediate upon successful payment'}\n3. Auto-renewal: This is a one-time payment. No auto-renewal.\n4. Support: PawOS support available at support@pawos.com\n5. Refund Policy: Standard refund policy applies`;

      const invoiceNotes = {
        // Invoice Details
        invoice_number: invoiceNumber,
        invoice_type: 'Team Plan Purchase',
        invoice_description: invoiceDescription,

        // Billing Information
        organization: organizationName || teamName,
        team_name: teamName,
        billing_address: [address1, address2].filter(Boolean).join(', '),
        billing_city: city,
        billing_state: billingState,
        billing_postal_code: postalCode,
        email: email,
        phone: mobileNumber,

        // Plan Details
        plan_type: 'Team',
        billing_frequency: billingFrequency === 'annually' ? 'Annual' : 'Monthly',
        payment_method: shouldShowBankTransfer ? 'Bank Transfer' : 'Card',

        // Seat Configuration
        standard_seats: standardSeatCount.toString(),
        premium_seats: premiumSeatCount.toString(),
        total_seats: (standardSeatCount + premiumSeatCount).toString(),

        // Tax Information
        tax_id: taxId || 'Not provided',
        gst_status: '0% Free',

        // Dates
        issue_date: today.toISOString().split('T')[0],
        expiry_date: expiryDate.toISOString().split('T')[0],

        // Line Items (for reference)
        line_items: lineItems.map((item: any) => `${item.description}: ₹${(item.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`).join('\n'),
      };

      // Show step: Creating invoice
      setPaymentStep('creating-invoice');

      const options: any = {
        key: 'rzp_test_key',
        amount: amountPaise,
        currency: 'INR',
        order_id: orderId,
        description: invoiceDescription,
        handler: async (response: any) => {
          try {
            // Step 2: Awaiting payment confirmation
            setPaymentStep('awaiting-payment');

            // Step 3: Processing payment
            setPaymentStep('processing');

            // Step 4: Confirming with backend
            setPaymentStep('confirming');
            const verifyResult = await (ipc as any).billingVerifyNativeTierPayment?.({ paymentId: response.razorpay_payment_id, orderId });

            if (verifyResult?.ok) {
              // Step 5: Success
              setPaymentStep('success');
              setTimeout(() => {
                onSuccess?.();
              }, 1500);
            } else {
              setErrorMessage('Payment verification failed');
              setPaymentStep('idle');
            }
          } catch (error) {
            setErrorMessage('Payment verification error: ' + (error instanceof Error ? error.message : 'Unknown error'));
            setPaymentStep('idle');
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: useBusinessName ? `${organizationName || teamName}` : fullName,
          email: email,
          contact: mobileNumber,
        },
        notes: invoiceNotes,
      };

      setPaymentStep('awaiting-payment');
      razorpay.open(options);
    } catch (error) {
      setErrorMessage('Payment error: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setProcessing(false);
    }
  };

  if (step === 'teamName') {
    return (
      <div style={{ maxHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '24px',
          }}
        >
          ‹
        </button>

        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '12px' }}>Let's create your team</h1>
          <p style={{ fontSize: '16px', color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '32px' }}>
            Team plans are best for groups up to 150 people. Choose a team name that invited members will easily recognize.
          </p>

          <div style={{ marginBottom: '24px', maxWidth: '500px', margin: '0 auto 24px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '6px' }}>
              {organizationName && `Organization: ${organizationName}`}
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                background: 'rgba(59, 130, 246, 0.05)',
                color: 'inherit',
                fontSize: '16px',
                boxSizing: 'border-box',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && teamName.trim()) {
                  setStep('seats');
                }
              }}
            />
            <p style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)', margin: '6px 0 0 0' }}>
              {organizationName ? `Prefilled based on your email. You can change this.` : ''}
            </p>
          </div>

          <button
            onClick={() => {
              if (teamName.trim()) {
                setStep('seats');
              }
            }}
            disabled={!teamName.trim()}
            style={{
              padding: '12px 32px',
              borderRadius: '8px',
              background: teamName.trim() ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)',
              color: 'white',
              border: 'none',
              cursor: teamName.trim() ? 'pointer' : 'default',
              fontWeight: 600,
              fontSize: '16px',
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (step === 'seats') {
    return (
      <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => setStep('teamName')}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '24px',
            marginBottom: '24px',
          }}
        >
          ‹
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>Choose your seats and plan</h2>
            <p style={{ color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '32px' }}>
              Team plans have a minimum of 2 seats. Pick your seat types below
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              <button
                onClick={() => setBillingFrequency('monthly')}
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: billingFrequency === 'monthly' ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: billingFrequency === 'monthly' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '2px solid #3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: billingFrequency === 'monthly' ? '#3b82f6' : 'transparent',
                    }}
                  >
                    {billingFrequency === 'monthly' && <div style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%' }} />}
                  </div>
                  <span style={{ fontWeight: 600 }}>Monthly</span>
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                  ₹{subtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/month + tax
                </div>
              </button>

              <button
                onClick={() => setBillingFrequency('annually')}
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: billingFrequency === 'annually' ? '2px solid #3b82f6' : '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: billingFrequency === 'annually' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '2px solid #3b82f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: billingFrequency === 'annually' ? '#3b82f6' : 'transparent',
                    }}
                  >
                    {billingFrequency === 'annually' && <div style={{ width: '6px', height: '6px', background: 'white', borderRadius: '50%' }} />}
                  </div>
                  <span style={{ fontWeight: 600 }}>Annually</span>
                  <span style={{ fontSize: '12px', color: '#3b82f6', marginLeft: 'auto' }}>Save 20%</span>
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                  ₹{(displaySubtotalInr / 12).toLocaleString('en-IN', { maximumFractionDigits: 2 })}/month + tax
                </div>
              </button>
            </div>

            <div style={{ borderRadius: '12px', border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', padding: '16px', marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontWeight: 600 }}>Standard seats</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>Best for most employees</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '18px' }}>
                    ₹{standardPriceInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                    per seat per {billingFrequency === 'monthly' ? 'month' : 'year'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => setStandardSeatCount(Math.max(0, standardSeatCount - 1))}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    −
                  </button>
                  <span style={{ width: '24px', textAlign: 'center', fontWeight: 600 }}>{standardSeatCount}</span>
                  <button
                    onClick={() => {
                      if (standardSeatCount + premiumSeatCount < MAX_TEAM_SEATS) {
                        setStandardSeatCount(standardSeatCount + 1);
                        setErrorMessage('');
                      } else {
                        setErrorMessage(`Maximum ${MAX_TEAM_SEATS} seats allowed. Contact support for higher seat counts.`);
                      }
                    }}
                    disabled={standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS ? 'rgba(var(--pawos-overlay-rgb), 0.4)' : 'inherit',
                      cursor: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS ? 'not-allowed' : 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div style={{ borderRadius: '12px', border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', padding: '16px' }}>
              <h4 style={{ margin: '0 0 16px 0', fontWeight: 600 }}>Premium seats</h4>
              <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>5x more usage than standard seats*</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '18px' }}>
                    ₹{premiumPriceInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                    per seat per {billingFrequency === 'monthly' ? 'month' : 'year'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    onClick={() => setPremiumSeatCount(Math.max(0, premiumSeatCount - 1))}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    −
                  </button>
                  <span style={{ width: '24px', textAlign: 'center', fontWeight: 600 }}>{premiumSeatCount}</span>
                  <button
                    onClick={() => {
                      if (standardSeatCount + premiumSeatCount < MAX_TEAM_SEATS) {
                        setPremiumSeatCount(premiumSeatCount + 1);
                        setErrorMessage('');
                      } else {
                        setErrorMessage(`Maximum ${MAX_TEAM_SEATS} seats allowed. Contact support for higher seat counts.`);
                      }
                    }}
                    disabled={standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS ? 'rgba(var(--pawos-overlay-rgb), 0.4)' : 'inherit',
                      cursor: standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS ? 'not-allowed' : 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
              padding: '20px',
              height: 'fit-content',
              position: 'sticky',
              top: '32px',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontWeight: 600 }}>Order details</h4>

            {standardSeatCount > 0 && (
              <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{standardSeatCount} Standard seats</span>
                  <span>₹{standardSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                  × ₹{standardPriceInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} per seat
                </div>
              </div>
            )}

            {premiumSeatCount > 0 && (
              <div style={{ marginBottom: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{premiumSeatCount} Premium seats</span>
                  <span>₹{premiumSubtotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>
                  × ₹{premiumPriceInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })} per seat
                </div>
              </div>
            )}

            <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(var(--pawos-overlay-rgb), 0.05)', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Total seats:</span>
                <span style={{ fontWeight: 600 }}>{standardSeatCount + premiumSeatCount} / {MAX_TEAM_SEATS}</span>
              </div>
              {standardSeatCount + premiumSeatCount >= MAX_TEAM_SEATS && (
                <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>
                  Max capacity reached. Contact support for more seats.
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', paddingTop: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span>Subtotal</span>
                <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '8px' }}>
                <span>
                  GST <span style={{ textDecoration: 'line-through', marginRight: '4px' }}>18%</span> <span style={{ color: '#10b981' }}>0% Free</span>
                </span>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
                paddingTop: '12px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              <span>Total due today</span>
              <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>

            <div style={{ borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', padding: '12px', marginBottom: '16px', fontSize: '12px', lineHeight: 1.5 }}>
              <p style={{ margin: 0, color: 'rgba(var(--pawos-text-rgb), 0.7)' }}>
                Subscribing to a Team plan creates a new account. Your existing projects & chats won't carry over, and your existing Pro plan subscription will auto-renew until canceled.{' '}
                <a href="#" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                  Learn more
                </a>
              </p>
            </div>

            {validationError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', color: '#ef4444', fontSize: '14px' }}>
                {validationError}
              </div>
            )}

            <button
              onClick={() => {
                const totalSeats = standardSeatCount + premiumSeatCount;
                if (totalSeats < 2) {
                  setValidationError('Minimum 2 seats required');
                  return;
                }
                setValidationError('');
                setStep('billing');
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Continue to billing
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'billing') {
    const canContinue = fullName.trim() && email.trim() && mobileNumber.trim() && country.trim() && address1.trim() && city.trim() && billingState.trim() && postalCode.trim();

    return (
      <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
        <button
          onClick={() => setStep('seats')}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '24px',
            marginBottom: '24px',
          }}
        >
          ‹
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '32px' }}>Billing information</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Full name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                    color: 'inherit',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  Phone <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                    color: 'inherit',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Country or region <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Address line 1 <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                placeholder="Street address"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Address line 2
              </label>
                  <input
                    type="text"
                    value={address2}
                    onChange={(e) => setAddress2(e.target.value)}
                    placeholder="Apartment, suite, etc. (optional)"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                      City <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                        background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                        color: 'inherit',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                      State <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    {STATES_BY_COUNTRY[country] ? (
                      <select
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                          color: 'inherit',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <option value="">Select state</option>
                        {STATES_BY_COUNTRY[country]?.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={billingState}
                        onChange={(e) => setBillingState(e.target.value)}
                        placeholder="State/Province"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                          background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                          color: 'inherit',
                          fontSize: '14px',
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                    Postal Code <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Postal code"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

            <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  Invoice Created Date
                </label>
                <input
                  type="text"
                  value={new Date().toISOString().split('T')[0]}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: 'rgba(var(--pawos-overlay-rgb), 0.1)',
                    color: 'rgba(var(--pawos-text-rgb), 0.6)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    cursor: 'not-allowed',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  Invoice Expiry Date
                </label>
                <input
                  type="text"
                  value={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                    background: 'rgba(var(--pawos-overlay-rgb), 0.1)',
                    color: 'rgba(var(--pawos-text-rgb), 0.6)',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    cursor: 'not-allowed',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="useBusinessName"
                checked={useBusinessName}
                onChange={(e) => setUseBusinessName(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="useBusinessName" style={{ fontSize: '14px', cursor: 'pointer', color: 'rgba(var(--pawos-text-rgb), 0.7)' }}>
                Use a different name on invoices
              </label>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Business tax ID <span style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>(Optional)</span>
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="GST number or Tax ID"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                  background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                  color: 'inherit',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)', margin: '6px 0 0 0' }}>
                If you provide a tax ID, the "Full name" above should be your business's name.
              </p>
            </div>

            <button
              onClick={() => {
                if (!canContinue) {
                  setErrorMessage('Please fill in all required fields');
                  return;
                }
                setErrorMessage('');
                setStep('payment');
              }}
              disabled={!canContinue}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: canContinue ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)',
                color: 'white',
                border: 'none',
                cursor: canContinue ? 'pointer' : 'default',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              Continue to payment
            </button>
          </div>

          <div
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
              padding: '20px',
              height: 'fit-content',
              position: 'sticky',
              top: '32px',
            }}
          >
            <h4 style={{ margin: '0 0 16px 0', fontWeight: '600' }}>Order summary</h4>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span>Subtotal</span>
              <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>

            <div style={{ fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '12px' }}>
              <span>
                GST <span style={{ textDecoration: 'line-through', marginRight: '4px' }}>18%</span> <span style={{ color: '#10b981' }}>0% Free</span>
              </span>
            </div>

            <div style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700 }}>
              <span>Total</span>
              <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment step
  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      <button
        onClick={() => setStep('billing')}
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '24px',
          marginBottom: '24px',
        }}
      >
        ‹
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '32px' }}>
        <div>
          <h2 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '32px' }}>
            {shouldShowBankTransfer ? 'Bank Transfer' : 'Card Payment'}
          </h2>

          {shouldShowBankTransfer ? (
            <div style={{ borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '20px', marginBottom: '24px', background: 'rgba(59, 130, 246, 0.05)' }}>
              <h4 style={{ margin: '0 0 16px 0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🏦</span> Bank Transfer
              </h4>
              <p style={{ fontSize: '14px', lineHeight: 1.6, margin: '0 0 16px 0', color: 'rgba(var(--pawos-text-rgb), 0.7)' }}>
                You'll get an invoice with transfer instructions sent to <strong>{email}</strong>. Your plan starts once payment clears (1 to 5 business days).
              </p>

              <div style={{ background: 'rgba(var(--pawos-overlay-rgb), 0.05)', borderRadius: '8px', padding: '12px', marginBottom: '12px', fontSize: '13px' }}>
                {organizationName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>Organization:</span>
                    <span style={{ fontWeight: 600 }}>{organizationName}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>Team name:</span>
                  <span style={{ fontWeight: 600 }}>{teamName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>Amount:</span>
                  <span style={{ fontWeight: 600 }}>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(var(--pawos-text-rgb), 0.6)' }}>Seats:</span>
                  <span style={{ fontWeight: 600 }}>Standard: {standardSeatCount}, Premium: {premiumSeatCount}</span>
                </div>
              </div>

              <p style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.6)', margin: 0 }}>
                Invoice and payment details will be sent to <strong>{email}</strong> and <strong>{mobileNumber}</strong>
              </p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Card number</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={cardNumber.replace(/\s/g, '').replace(/(\d{4})(?=\d)/g, '$1 ')}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\s/g, '').slice(0, 16))}
                    placeholder="1234 1234 1234 1234"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingRight: '120px',
                      borderRadius: '8px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px' }}>
                    {cardBrand === 'visa' && <span style={{ fontSize: '20px' }}>💳 VISA</span>}
                    {cardBrand === 'mastercard' && <span style={{ fontSize: '20px' }}>💳 MC</span>}
                    {cardBrand === 'rupay' && <span style={{ fontSize: '20px' }}>💳 RuPay</span>}
                    {!cardBrand && <span style={{ fontSize: '12px', color: 'rgba(var(--pawos-text-rgb), 0.4)' }}>Visa, MC, RuPay</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Expiration date</label>
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
                      borderRadius: '8px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Security code</label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    placeholder="CVC"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
                      background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
                      color: 'inherit',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {errorMessage && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '24px', color: '#ef4444', fontSize: '14px' }}>
              {errorMessage}
            </div>
          )}

          {processing && paymentStep !== 'idle' && (
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', color: '#3b82f6' }}>Payment Progress</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: paymentStep !== 'idle' ? '#10b981' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>✓</div>
                  <span>Creating invoice...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: ['awaiting-payment', 'processing', 'confirming', 'success'].includes(paymentStep) ? '#3b82f6' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>●</div>
                  <span>Awaiting payment...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: ['processing', 'confirming', 'success'].includes(paymentStep) ? '#3b82f6' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>●</div>
                  <span>Processing payment...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: ['confirming', 'success'].includes(paymentStep) ? '#3b82f6' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>●</div>
                  <span>Confirming payment...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: paymentStep === 'success' ? '#10b981' : '#d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px', fontWeight: 'bold' }}>{paymentStep === 'success' ? '✓' : '●'}</div>
                  <span style={{ color: paymentStep === 'success' ? '#10b981' : 'inherit' }}>Success - Tier Activated</span>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={processing}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              background: processing ? 'rgba(59, 130, 246, 0.5)' : '#3b82f6',
              color: 'white',
              border: 'none',
              cursor: processing ? 'default' : 'pointer',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            {processing ? (paymentStep === 'success' ? '✓ Success!' : 'Processing payment...') : `Pay ₹${displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          </button>
        </div>

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)',
            padding: '20px',
            height: 'fit-content',
            position: 'sticky',
            top: '32px',
          }}
        >
          <h4 style={{ margin: '0 0 16px 0', fontWeight: '600' }}>Order summary</h4>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span>Subtotal</span>
            <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          <div style={{ fontSize: '13px', color: 'rgba(var(--pawos-text-rgb), 0.6)', marginBottom: '12px' }}>
            <span>
              GST <span style={{ textDecoration: 'line-through', marginRight: '4px' }}>18%</span> <span style={{ color: '#10b981' }}>0% Free</span>
            </span>
          </div>

          <div style={{ borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.1)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700 }}>
            <span>Total</span>
            <span>₹{displaySubtotalInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>

          {shouldShowBankTransfer && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', fontSize: '12px', lineHeight: 1.5, color: 'rgba(var(--pawos-text-rgb), 0.7)' }}>
              Amount exceeds ₹50,000 — redirecting to Bank Transfer
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
