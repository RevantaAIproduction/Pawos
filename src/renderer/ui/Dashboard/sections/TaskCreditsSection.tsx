import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../../organization/AutonomousTaskBillingService';
import { AUTONOMOUS_TASK_PRICE_USD, MIN_TASK_CREDIT_PURCHASE } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { OrganizationBillingEvent, TaskCreditBalance, TaskCreditPurchase } from '../../../../shared/organization/AutonomousTaskBillingTypes';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { SubscriptionTierId } from '../../../../shared/billing/BillingTypes';

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
 * AutonomousTaskBillingCard.tsx — same prepaid-credit model, scoped to the
 * signed-in user's own personal balance (organizationId: null) instead of
 * an organization's. Team/Enterprise members see the org-scoped card
 * inside Organization settings instead; this card is for a Pro/Pro Max
 * individual account, which is exactly the gap that used to require a real
 * organizationId the account never had.
 */
export function TaskCreditsSection({ user }: { user: AuthUser }) {
  const [tier, setTier] = useState<SubscriptionTierId | null>(null);
  const [balance, setBalance] = useState<TaskCreditBalance | null>(null);
  const [purchases, setPurchases] = useState<TaskCreditPurchase[]>([]);
  const [events, setEvents] = useState<OrganizationBillingEvent[]>([]);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creditsInput, setCreditsInput] = useState(String(MIN_TASK_CREDIT_PURCHASE));
  const [busy, setBusy] = useState(false);

  function reload() {
    if (user.isGuest) {
      setLoading(false);
      return;
    }
    Promise.all([
      ipc.billingGetSubscription(),
      autonomousTaskBillingService.getCreditBalance(null),
      autonomousTaskBillingService.listCreditPurchases(null, 100),
      autonomousTaskBillingService.listBillingHistory(null, 200),
      autonomousTaskBillingService.listRecentRuns(null, 200),
    ])
      .then(([subscription, creditBalance, creditPurchases, billingHistory, recentRuns]) => {
        setTier(subscription.tier);
        setBalance(creditBalance);
        setPurchases(creditPurchases);
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

  async function buyCredits() {
    const parsed = Number.parseInt(creditsInput, 10);
    if (!Number.isFinite(parsed) || parsed < MIN_TASK_CREDIT_PURCHASE) {
      setError(`Minimum purchase is ${MIN_TASK_CREDIT_PURCHASE} credits ($${MIN_TASK_CREDIT_PURCHASE * AUTONOMOUS_TASK_PRICE_USD}).`);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const callbackUrl = await ipc.billingStartCheckoutSync().catch(() => undefined);
      const result = await ipc.billingCreateCreditsCheckoutSession(parsed, undefined, callbackUrl);
      if (result.ok) {
        await ipc.actionExecute({ type: 'openUrl', url: result.checkoutUrl });
        setMessage('Opened checkout in your browser. Your balance updates automatically once payment completes.');
      } else {
        setError(result.reason);
      }
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
        <h3 className={styles.cardTitle}>Autonomous Engineering Tasks</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Loading…</p>
      </div>
    );
  }

  if (tier !== 'pro' && tier !== 'proMax') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Autonomous Engineering Tasks</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Available on Paw Pro and Paw Pro Max — upgrade to buy prepaid task credits and let Paw ship real code
          changes end to end.
        </p>
      </div>
    );
  }

  const monthToDate = autonomousTaskBillingService.monthToDateTotal(events);
  const remaining = balance?.balance ?? 0;

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Autonomous Engineering Tasks</h3>
      <p className={styles.cardBody} style={{ marginTop: 6, marginBottom: 12 }}>
        ${AUTONOMOUS_TASK_PRICE_USD} per Autonomous Engineering Task credit, prepaid — never for chat, research,
        meetings, documents, browser automation, or manual coding help. A credit is only deducted once a task
        reaches successful completion.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Credit balance</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{remaining} credit{remaining === 1 ? '' : 's'}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Total completed</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{totalCompleted}</p>
        </div>
        <div>
          <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Spend this month</p>
          <p style={{ fontSize: 18, fontWeight: 600 }}>${monthToDate.toFixed(2)}</p>
        </div>
      </div>

      {remaining === 0 && (
        <p style={{ color: '#e0c28c', fontSize: 12.5, marginBottom: 10 }}>
          No credits remaining — purchase more below before starting a new Autonomous Engineering Task.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <input
          style={inputStyle}
          type="number"
          min={MIN_TASK_CREDIT_PURCHASE}
          value={creditsInput}
          onChange={(e) => setCreditsInput(e.target.value)}
        />
        <button type="button" className={styles.primaryButton} disabled={busy} onClick={buyCredits}>
          {busy ? 'Opening checkout…' : `Buy credits ($${AUTONOMOUS_TASK_PRICE_USD}/credit)`}
        </button>
        <span style={{ fontSize: 12, color: '#96969e' }}>
          Minimum {MIN_TASK_CREDIT_PURCHASE} credits (${MIN_TASK_CREDIT_PURCHASE * AUTONOMOUS_TASK_PRICE_USD})
        </span>
      </div>
      {message && <p style={{ color: '#8ce0a8', fontSize: 12.5, marginBottom: 10 }}>{message}</p>}

      <div style={{ marginTop: 14, marginBottom: 6 }}>
        <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Purchase history</p>
      </div>
      {purchases.length === 0 ? (
        <p className={styles.cardBody}>No credit purchases yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto', marginBottom: 14 }}>
          {purchases.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{p.credits} credits</span>
              <span>${p.amountUsd.toFixed(2)}</span>
              <span style={{ color: '#96969e' }}>{new Date(p.purchasedAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 6 }}>
        <p className={styles.cardBody} style={{ fontSize: 12, color: '#96969e' }}>Credit usage history</p>
      </div>
      {events.length === 0 ? (
        <p className={styles.cardBody}>No completed Autonomous Engineering Tasks yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {events.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span>{e.ticketId ?? '(no ticket)'} · {Math.round(e.durationSeconds / 60)}m</span>
              <span>1 credit (${e.amountUsd.toFixed(2)})</span>
              <span style={{ color: '#96969e' }}>{new Date(e.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
