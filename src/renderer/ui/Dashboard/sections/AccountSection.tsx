import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import type { AuthUser } from '../../../auth/AuthTypes';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { PricingConfig, SubscriptionState, CreditBalance, SubscriptionTierId } from '../../../../shared/billing/BillingTypes';

const PROVIDER_LABEL: Record<AuthUser['provider'], string> = {
  google: 'Google',
  email: 'Email',
  guest: 'Guest',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

function formatPrice(priceCents: number | null, period: 'month' | 'year'): string {
  if (priceCents === null) return 'Pricing not finalized yet';
  if (priceCents === 0) return 'Free';
  return `$${(priceCents / 100).toFixed(2)}/${period}`;
}

export function AccountSection({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    ipc.billingGetPricing().then(setPricing).catch(() => {});
    ipc.billingGetSubscription().then(setSubscription).catch(() => {});
    ipc.billingGetCreditBalance().then(setCredits).catch(() => {});
  };

  useEffect(() => {
    refresh();
  }, []);

  const switchTier = async (tier: SubscriptionTierId) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await ipc.billingSetSubscriptionTier(tier);
      setSubscription(updated);
      setMessage(
        tier === 'pro'
          ? "You're previewing Paw Pro — no payment was taken (billing isn't configured yet)."
          : 'Switched back to Paw Go.'
      );
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async (tier: SubscriptionTierId) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await ipc.billingCreateCheckoutSession(tier);
      setMessage(result.ok ? `Redirecting to checkout: ${result.checkoutUrl}` : result.reason);
    } finally {
      setBusy(false);
    }
  };

  const currentPlan = pricing?.plans.find((p) => p.id === (subscription?.tier ?? 'go'));

  return (
    <div>
      <div className={styles.card} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        {user.pictureUrl ? (
          <img
            src={user.pictureUrl}
            alt=""
            style={{ width: 56, height: 56, borderRadius: '999px', objectFit: 'cover' }}
          />
        ) : (
          <div
            className={styles.userAvatar}
            style={{ width: 56, height: 56, fontSize: 22, flexShrink: 0 }}
          >
            {initial}
          </div>
        )}
        <div>
          <h3 className={styles.cardTitle} style={{ marginBottom: 4 }}>
            {user.name}
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={styles.chip}>{PROVIDER_LABEL[user.provider]} account</span>
            {user.isGuest && <span className={styles.chip}>Guest Session</span>}
          </div>
          {user.email && <p className={styles.cardBody} style={{ marginTop: 6 }}>{user.email}</p>}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Subscription</h3>
          <p className={styles.cardBody}>
            {subscription ? (currentPlan?.label ?? subscription.tier) : '…'}
            {currentPlan && ` — ${formatPrice(currentPlan.priceCents, currentPlan.billingPeriod)}`}
          </p>
          {subscription?.tier === 'go' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" className={styles.primaryButton} onClick={() => switchTier('pro')} disabled={busy}>
                Preview Paw Pro
              </button>
              <button type="button" className={styles.primaryButton} onClick={() => startCheckout('pro')} disabled={busy}>
                Set up billing
              </button>
            </div>
          ) : (
            <button type="button" className={styles.primaryButton} style={{ marginTop: 8 }} onClick={() => switchTier('go')} disabled={busy}>
              Switch to Paw Go
            </button>
          )}
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>AI Credit Usage</h3>
          <p className={styles.cardBody}>
            {credits ? `${credits.usedThisPeriod} used this period` : '…'}
            {credits && (credits.limit === null ? ' — no cap configured yet' : ` / ${credits.limit}`)}
          </p>
        </div>
      </div>

      {message && <p className={styles.cardBody} style={{ marginTop: 12 }}>{message}</p>}

      {user.isGuest && (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <p className={styles.cardBody}>
            You're on a Guest Session — no cloud sync, subscriptions, token purchases, backup, or
            cross-device sync. Go to <strong>Settings → Account</strong> to upgrade to a real
            account without losing your companion, memories, or settings.
          </p>
        </div>
      )}

      <button type="button" className={styles.dangerButton} style={{ marginTop: 20 }} onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
