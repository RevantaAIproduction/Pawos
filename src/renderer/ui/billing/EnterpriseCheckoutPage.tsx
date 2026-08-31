/**
 * Enterprise Checkout Flow
 * Step 1: Enter Price (Explanation + Contact Form)
 * Step 2: Key Benefits
 * Step 3: Organization Details (Pre-filled)
 * Step 4: Seats & Usage Configuration
 * Step 5: Success
 */

import React, { useState } from 'react';
import styles from './enterpriseCheckout.module.css';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import { enterpriseBillingService } from '../../services/supabase/enterpriseBillingService';

type Step = '1-form' | '2-benefits' | '3-org' | '4-config' | '5-success' | '6-details';

type Props = {
  onClose: () => void;
  onSuccess?: () => void;
};

export function EnterpriseCheckoutPage({ onClose, onSuccess }: Props) {
  const ipc = useIpcBridge();
  const [step, setStep] = useState<Step>('1-form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Step 1: Contact info
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [seatsNeeded, setSeatsNeeded] = useState(50);

  // Step 3: Organization details (pre-filled from step 1)
  const [orgName, setOrgName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Step 4: Configuration
  const [usageLimit, setUsageLimit] = useState(100);
  const [startingBalance, setStartingBalance] = useState(400);

  const [inquiryId, setInquiryId] = useState<string>();

  // ============================================================================
  // CALCULATIONS - All Card Logic
  // ============================================================================
  // Seats pricing
  const monthlySeatsPrice = seatsNeeded * 20;
  const yearlySeatsPrice = monthlySeatsPrice * 12;

  // Usage limit per user per month
  const usageLimitPerUser = usageLimit;

  // Max spend per user (same as usage limit)
  const maxSpendPerUser = usageLimitPerUser;

  // Starting balance (pool for entire org)
  const startingBalanceAmount = startingBalance;

  // ============================================================================
  // STEP 1: SUBMIT CONTACT FORM
  // ============================================================================
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(undefined);

    try {
      const inquiry = { name, email, company, phone, seatsNeeded };

      const result = await (ipc as any).enterpriseSubmitInquiry(inquiry);
      if (!result.ok) throw new Error(result.reason || 'Failed to submit');

      const supabaseResult = await enterpriseBillingService.submitInquiry(inquiry);
      if (!supabaseResult) throw new Error('Database save failed');

      setInquiryId(supabaseResult.id);
      setStep('2-benefits');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error submitting form');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // STEP 3: PREFILL ORG INFO FROM STEP 1
  // ============================================================================
  const handleStep2Next = () => {
    setOrgName(company);
    setAdminName(name);
    setAdminEmail(email);
    setStep('3-org');
  };

  // ============================================================================
  // STEP 3: SUBMIT ORG DETAILS
  // ============================================================================
  const handleStep3Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName || !adminName || !adminEmail) {
      setError('All fields required');
      return;
    }
    setStep('4-config');
  };

  // ============================================================================
  // STEP 4: SUBMIT CONFIG & SAVE TO DB
  // ============================================================================
  const handleStep4Submit = async () => {
    if (usageLimit < 20 || usageLimit > 1000) {
      setError('Usage limit: $20–$1000/month per user');
      return;
    }
    if (startingBalance < 400) {
      setError('Minimum $400 starting balance');
      return;
    }

    setLoading(true);
    setError(undefined);

    try {
      const result = await (ipc as any).enterpriseCreateOrder({
        inquiryId,
        seatsCount: seatsNeeded,
        spendingLimitPerUserCents: Math.round(usageLimit * 100),
        startingBalanceCents: Math.round(startingBalance * 100),
      });

      if (!result.ok) throw new Error(result.reason || 'Order failed');

      setStep('5-success');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RENDER STEPS
  // ============================================================================

  // STEP 1: CONTACT FORM WITH EXPLANATION
  if (step === '1-form') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>

          {/* Explanation Card */}
          <div className={styles.explainerCard}>
            <h3>How We Charge</h3>
            <p>$20 per seat per month billed annually, plus usage-based pricing</p>

            <h3 style={{ marginTop: 16 }}>Organization Onboarding</h3>
            <p>We handle setup, user provisioning, and ongoing support</p>
          </div>

          <div style={{ marginTop: 24 }}>
            <div className={styles.stepLabel}>STEP 1</div>
            <h2>Let us know your organisation and required seats</h2>

            {error && <div className={styles.error}>{error}</div>}

            <form onSubmit={handleStep1Submit}>
              <div className={styles.field}>
                <label>Full Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label>Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label>Company *</label>
                <input type="text" value={company} onChange={e => setCompany(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label>Phone *</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
              </div>
              <div className={styles.field}>
                <label>Seats Needed *</label>
                <input type="number" min="20" value={seatsNeeded} onChange={e => setSeatsNeeded(parseInt(e.target.value))} required />
              </div>

              <button type="submit" className={styles.button} disabled={loading}>
                {loading ? 'Sending...' : 'Next →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: KEY BENEFITS
  if (step === '2-benefits') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.stepLabel}>STEP 2</div>
          <h2>Key Benefits</h2>

          <div className={styles.benefitsList}>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>🎫</div>
              <strong>$20 Ticket Credit per Seat</strong>
              <p>Autonomous ticket wallet for each user</p>
            </div>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>👥</div>
              <strong>Unlimited Team</strong>
              <p>Add as many team members as you need</p>
            </div>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>💳</div>
              <strong>Flexible Billing</strong>
              <p>Pay per seat, pay for usage you use</p>
            </div>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>🔒</div>
              <strong>Organization Control</strong>
              <p>Admin dashboard & team management</p>
            </div>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>⚡</div>
              <strong>Usage Limits</strong>
              <p>Set monthly spending caps per user</p>
            </div>
            <div className={styles.benefitItem}>
              <div className={styles.benefitIcon}>🎯</div>
              <strong>Dedicated Support</strong>
              <p>Personal onboarding & support team</p>
            </div>
          </div>

          <button onClick={handleStep2Next} className={styles.button}>
            Next →
          </button>
        </div>
      </div>
    );
  }

  // STEP 3: ORGANIZATION DETAILS (PRE-FILLED)
  if (step === '3-org') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.stepLabel}>STEP 3</div>
          <h2>Organization Details</h2>

          <div className={styles.explainerCard}>
            <p><strong>How it works:</strong></p>
            <p>You set up the organization. After approval, you receive an admin email to invite team members using your company email domain (@organization.com or @company.com)</p>
            <p style={{ marginTop: '12px', fontSize: '12px', color: '#ff9800' }}>
              ⚠️ Only company domain emails are accepted. Personal emails (Gmail, Yahoo, etc.) will be rejected.
            </p>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <form onSubmit={handleStep3Submit}>
            <div className={styles.field}>
              <label>Organization Name *</label>
              <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>Admin Name *</label>
              <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} required />
            </div>
            <div className={styles.field}>
              <label>Admin Email *</label>
              <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} required />
            </div>

            <button type="submit" className={styles.button}>
              Next →
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STEP 4: SEATS & USAGE CONFIGURATION
  if (step === '4-config') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.stepLabel}>STEP 4</div>

          {error && <div className={styles.error}>{error}</div>}

          {/* Seats Card */}
          <div className={styles.configCard}>
            <h3>Seats</h3>
            <p className={styles.cardValue}>{seatsNeeded} seats</p>
            <p className={styles.cardPrice}>${monthlySeatsPrice}/month • ${yearlySeatsPrice}/year</p>
          </div>

          {/* Usage Limit & Max Spend Card (Combined) */}
          <div className={styles.configCard}>
            <h3>Set Usage Limit per User</h3>
            <p className={styles.cardDesc}>You're only billed for what you end up using. Adjust any time</p>

            <div className={styles.buttonRow}>
              {[20, 50, 100, 200, 500, 1000].map(amount => (
                <button
                  key={amount}
                  className={`${styles.amountBtn} ${usageLimitPerUser === amount ? styles.amountBtnActive : ''}`}
                  onClick={() => setUsageLimit(amount)}
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Max Spend Display (inside same card) */}
            <div className={styles.maxSpendRow}>
              <div>
                <p className={styles.maxSpendLabel}>Max Spend per User</p>
                <p className={styles.cardDesc}>Your bill will never exceed this amount</p>
              </div>
              <div className={styles.maxSpendAmount}>${maxSpendPerUser}</div>
            </div>
          </div>

          {/* Starting Balance Card */}
          <div className={styles.configCard}>
            <h3>Set Starting Usage Balance</h3>
            <p className={styles.cardDesc}>This will be your team's initial pool of usage. You can buy more</p>

            <input
              type="number"
              min="400"
              step="50"
              value={startingBalanceAmount}
              onChange={e => setStartingBalance(parseInt(e.target.value) || 400)}
              className={styles.balanceInput}
            />
            <p className={styles.balanceHint}>Minimum: $400</p>
          </div>

          <button onClick={handleStep4Submit} className={styles.button} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit →'}
          </button>
        </div>
      </div>
    );
  }

  // STEP 5: SUCCESS
  if (step === '5-success') {
    return (
      <div className={styles.container}>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <div className={styles.successCheckmark}>✓</div>
          <h2>Thank you for choosing PawOS</h2>
          <p className={styles.subtitle}>PawOS organization dedicated team member contacts you in a while within 48hrs</p>

          <button onClick={() => setStep('6-details')} className={styles.buttonSecondary}>
            See more about enterprise in PawOS
          </button>

          <button onClick={onClose} className={styles.button}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // STEP 6: ENTERPRISE DETAILS
  if (step === '6-details') {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.stepLabel}>ENTERPRISE DETAILS</div>
          <h2>Enterprise Plans & Pricing</h2>

          <div className={styles.detailsSection}>
            <h3>PC Pricing</h3>
            <p className={styles.detailText}>1 Dollar ($1) = 100 PCs (Paw Compute)</p>
            <div className={styles.detailsBox}>
              <p>PCs are used for AI operations, token processing, and advanced features</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>Monthly Allocation</h3>
            <div className={styles.detailsBox}>
              <p><strong>Starting Balance:</strong> Initial pool of PCs for your organization</p>
              <p><strong>Usage Limit:</strong> Maximum PCs per team member per month</p>
              <p><strong>Overage:</strong> Additional usage billed at standard rates</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>Usage Tracking</h3>
            <div className={styles.detailsBox}>
              <p><strong>Admin sees:</strong></p>
              <p style={{ marginLeft: '16px' }}>• Each member: email@organisation.com</p>
              <p style={{ marginLeft: '16px' }}>• Remaining limits: $XX</p>
              <p style={{ marginLeft: '16px' }}>• Today used: $XX</p>
              <p style={{ marginLeft: '16px' }}>• Their own usage too</p>
              <p style={{ marginLeft: '16px' }}>• All members' usage dashboard</p>

              <p style={{ marginTop: '12px' }}><strong>Members see:</strong></p>
              <p style={{ marginLeft: '16px' }}>• Their own limit: $XX/month</p>
              <p style={{ marginLeft: '16px' }}>• Used today: $XX</p>
              <p style={{ marginLeft: '16px' }}>• Remaining: $XX</p>
              <p style={{ marginLeft: '16px' }}>• Can use normally (that's it)</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>Team Member Invitation</h3>
            <div className={styles.detailsBox}>
              <p><strong>1. Admin receives email</strong> after organization is approved</p>
              <p><strong>2. Admin invites team members</strong> with company email domain only (@organization.com, @company.com)</p>
              <p><strong>3. Users accept & log in</strong> with their company email</p>
              <p><strong>4. Each seat gets $20</strong> in autonomous ticket wallet automatically</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>What's Included</h3>
            <div className={styles.detailsList}>
              <p>✓ Unlimited team members (company domain only)</p>
              <p>✓ Admin dashboard & controls</p>
              <p>✓ Usage tracking & analytics</p>
              <p>✓ Custom spending limits per user</p>
              <p>✓ $20 ticket credit per seat</p>
              <p>✓ Dedicated support team</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>Usage Limits</h3>
            <div className={styles.detailsBox}>
              <p><strong>5-Hour Rolling Window:</strong> Max PC usage in any 5-hour period</p>
              <p><strong>Weekly Rolling Window:</strong> Max PC usage per 7-day period</p>
              <p><strong>Monthly Limit:</strong> Max PC usage per calendar month</p>
            </div>
          </div>

          <div className={styles.detailsSection}>
            <h3>What Happens Next</h3>
            <div className={styles.detailsBox}>
              <p><strong>1. Demo Sent</strong> → We send you enterprise demo and details</p>
              <p><strong>2. Review Period</strong> → Your request under review (visible in PawOS as "Enterprise - Under Review")</p>
              <p><strong>3. Current Tier Active</strong> → Keep using your current tier (Pro/Pro Max/Team) while waiting</p>
              <p><strong>4. Approval</strong> → We contact your team member within 48hrs</p>
              <p><strong>5. Enterprise Active</strong> → Your tier upgrades to Enterprise in PawOS</p>
            </div>
          </div>


          <button onClick={() => setStep('5-success')} className={styles.buttonSecondary}>
            Back
          </button>

          <button onClick={onClose} className={styles.button}>
            Exit
          </button>
        </div>
      </div>
    );
  }

  return null;
}
