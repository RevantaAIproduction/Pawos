import React from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';

/**
 * The friendly, non-blocking notice shown whenever an AI request can't run
 * because the current plan has no AI (Paw Go) or the AI credit pool for
 * this period is exhausted. Never a full-screen blocker — desktop features
 * keep working underneath it; this is a dismissible inline card, reused by
 * any runtime that hits an entitlement/credit wall (see EntitlementService).
 */
export function CreditsRequiredNotice({
  tier,
  onUpgrade,
  onDismiss,
}: {
  tier: SubscriptionTierId;
  /** Omit where there's no real navigation target yet — the notice still explains where to go. */
  onUpgrade?: () => void;
  onDismiss: () => void;
}) {
  const message =
    tier === 'go'
      ? "Paw Go doesn't include AI models. Open Settings → Subscription to upgrade to Paw Pro for chat, voice, and vision."
      : "You've used all of this period's AI credits. Everything else keeps working — open Settings → Subscription to upgrade, or wait for your next credit reset.";

  return (
    <div className={styles.card} style={{ borderColor: 'var(--accent, #6d5efc)' }}>
      <h3 className={styles.cardTitle}>More AI credits needed</h3>
      <p className={styles.cardBody}>{message}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {onUpgrade && (
          <button type="button" className={styles.primaryButton} onClick={onUpgrade}>
            View plans
          </button>
        )}
        <button type="button" className={styles.chip} onClick={onDismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
