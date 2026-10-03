import React, { useEffect, useState } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { EntitlementSnapshot } from '../../../shared/billing/BillingTypes';
import type { MidMonthOfferResult } from '../../../shared/billing/UsageBucketTypes';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../../auth/supabaseClient';
import { initiateMidMonthPayment } from '../Dashboard/sections/CreditsPaymentHandler';

/**
 * "Pending billing": the server reports the plan's PC for this period AND every purchased credit
 * are used up (limitReason 'plan_exhausted' — never set while credits remain). The server decides
 * whether the plan offers a mid-period payment; nothing here names a tier.
 */
export function isPendingBilling(entitlement: EntitlementSnapshot | null | undefined): boolean {
  return !!entitlement && !entitlement.pooled && entitlement.usageSummary?.limitReason === 'plan_exhausted';
}

export function formatBillingPrice(amountUsd: number): string {
  return `$${Number.isInteger(amountUsd) ? amountUsd.toLocaleString() : amountUsd.toFixed(2)}`;
}

function formatRenewal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The card itself — price and renewal date only, never PC or the product's internal name. */
export function PendingBillingCard({
  amountUsd,
  activeUntil,
  busy,
  message,
  onCompleteBilling,
  onDismiss,
}: {
  amountUsd: number;
  activeUntil: string | null;
  busy: boolean;
  message: string | null;
  onCompleteBilling: () => void;
  onDismiss: () => void;
}) {
  const price = formatBillingPrice(amountUsd);
  const until = formatRenewal(activeUntil);
  const isError = !!message && message.startsWith('[error]');
  return (
    <div className={styles.card} style={{ borderColor: 'var(--accent, #6d5efc)' }} data-testid="pending-billing">
      <h3 className={styles.cardTitle}>Pending billing</h3>
      <p className={styles.cardBody}>
        You've used everything included in your plan for this period, including your credits. Complete billing
        ({price}) to keep using PawOS{until ? ` until your plan renews on ${until}` : ' until your plan renews'}.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className={styles.primaryButton} onClick={onCompleteBilling} disabled={busy}>
          {busy ? 'Processing…' : `Complete billing — ${price}`}
        </button>
        <button type="button" className={styles.chip} onClick={onDismiss} disabled={busy}>
          Not now
        </button>
      </div>
      {message && (
        <p className={styles.cardBody} style={{ marginTop: 8, color: isError ? 'var(--pawos-danger, #d9534f)' : '#4cb050' }}>
          {isError ? message.replace(/^\[error\]\s*/, '') : message}
        </p>
      )}
    </div>
  );
}

/**
 * Fetches the server's offer for this account and shows the Pending billing card. When the server
 * has no offer (the plan doesn't sell one, or it can't be reached) the regular notice is shown.
 */
export function PendingBillingNotice({
  userEmail,
  onDismiss,
  onBillingComplete,
  fallback,
}: {
  userEmail?: string;
  onDismiss: () => void;
  /** Called after the payment is verified by the server. */
  onBillingComplete: () => void;
  fallback: React.ReactNode;
}) {
  const [offer, setOffer] = useState<MidMonthOfferResult | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = await getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const result = token ? await ipc.billingGetMidMonthOffer(token) : null;
        if (alive) setOffer(result);
      } catch {
        if (alive) setOffer(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (offer === 'loading') return null;
  if (!offer || !offer.ok || !offer.available) return <>{fallback}</>;

  const completeBilling = () =>
    initiateMidMonthPayment({
      setMessage,
      setBusy,
      userEmail,
      // billing:verifyMidMonthPayment has already refreshed the usage summary and announced the
      // entitlement change by the time this runs.
      refresh: onBillingComplete,
    });

  return (
    <PendingBillingCard
      amountUsd={offer.amountUsd}
      activeUntil={offer.expiresAt}
      busy={busy}
      message={message}
      onCompleteBilling={completeBilling}
      onDismiss={onDismiss}
    />
  );
}
