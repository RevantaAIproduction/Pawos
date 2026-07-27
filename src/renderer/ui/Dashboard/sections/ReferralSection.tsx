import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { referralService } from '../../../organization/ReferralService';
import { referralCreditService } from '../../../organization/ReferralCreditService';
import { REFERRALS_PER_MILESTONE, REWARD_USD_PER_MILESTONE } from '../../../../shared/referral/ReferralTypes';
import type { Referral, ReferralReward } from '../../../../shared/referral/ReferralTypes';
import type { ReferralCreditBalance } from '../../../../shared/billing/ReferralCreditTypes';
import type { AuthUser } from '../../../auth/AuthTypes';

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
};

/**
 * Referral engine card: share your own code, apply someone else's (once),
 * and see real progress toward the next reward. A referral only counts once
 * the referred account genuinely subscribes to Pro or Pro Max — "signed up"
 * and "subscribed" are shown as distinct states rather than collapsed into
 * one, since only the latter counts toward a reward. Every 5 subscribed
 * referrals grants $100 in Referral Credits automatically — no claim
 * button, since the server-side RPC grants it the moment the 5th
 * conversion lands. Referral Credits are a third balance, fully separate
 * from both Subscription billing and the Autonomous Ticket System's
 * Ticket Balance — usable only for Coding Runtime, AI Runtime, Companion
 * Runtime, and future runtime-based usage; never for tickets, ticket
 * investigations, subscriptions, plan upgrades, cash withdrawal,
 * transfers, or any external payout.
 */
export function ReferralSection({ user }: { user: AuthUser }) {
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [referralCredits, setReferralCredits] = useState<ReferralCreditBalance | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function reload() {
    Promise.all([
      referralService.getOrCreateCode(),
      referralService.listMyReferrals(),
      referralService.listMyRewards(),
      referralService.hasAppliedCode(),
      referralCreditService.getBalance(),
    ])
      .then(([myCode, myReferrals, myRewards, applied, credits]) => {
        setCode(myCode);
        setReferrals(myReferrals);
        setRewards(myRewards);
        setHasApplied(applied);
        setReferralCredits(credits);
      })
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(reload, [user.isGuest]);

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setMessage('Referral code copied.');
  }

  async function submitCode() {
    if (!codeInput.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await referralService.applyCode(codeInput.trim());
      setMessage('Referral code applied.');
      setCodeInput('');
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (user.isGuest) return null;

  if (loading) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Refer PawOS</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  const subscribedCount = referrals.filter((r) => r.status === 'subscribed').length;
  const progressInMilestone = subscribedCount % REFERRALS_PER_MILESTONE;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Refer PawOS</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        Share your code. When {REFERRALS_PER_MILESTONE} people you refer take a Pro or Pro Max subscription, you get
        ${REWARD_USD_PER_MILESTONE} in Referral Credits — usable for Coding Runtime, AI Runtime, Companion Runtime, and
        future runtime-based usage. Referral Credits are a separate balance from both your subscription and the
        Autonomous Ticket System's Ticket Balance, and can never be spent on tickets, subscriptions, plan upgrades,
        or withdrawn as cash. A referral only counts once they genuinely subscribe; signing up alone doesn't count.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <code style={{ ...inputStyle, fontSize: 15, letterSpacing: 1, fontWeight: 600 }}>{code}</code>
        <button type="button" className={styles.primaryButton} onClick={copyCode}>Copy code</button>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Subscribed referrals</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{subscribedCount}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Progress to next reward</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{progressInMilestone} / {REFERRALS_PER_MILESTONE}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Referral Credits balance</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>${(referralCredits?.balanceUsd ?? 0).toFixed(2)}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Total earned</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>${rewards.reduce((sum, r) => sum + r.amountUsd, 0).toFixed(0)}</p>
        </div>
      </div>

      {!hasApplied && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <input
            style={inputStyle}
            type="text"
            placeholder="Have a referral code?"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={submitCode}>
            {busy ? 'Applying…' : 'Apply code'}
          </button>
        </div>
      )}
      {message && <p style={{ color: '#8ce0a8', fontSize: 12.5, marginBottom: 10 }}>{message}</p>}

      {referrals.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e', marginBottom: 6 }}>Your referrals</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {referrals.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: r.status === 'subscribed' ? '#8ce0a8' : '#96969e' }}>
                  {r.status === 'subscribed' ? `Subscribed (${r.subscribedTier})` : 'Signed up'}
                </span>
                <span style={{ color: '#96969e' }}>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
