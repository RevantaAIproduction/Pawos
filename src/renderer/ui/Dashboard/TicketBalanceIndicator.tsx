import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import { autonomousTaskBillingService } from '../../organization/AutonomousTaskBillingService';

/**
 * Quick-access Autonomous Ticket Balance pill, always visible top-right of the Dashboard shell
 * (not buried three clicks deep in Settings) — clicking it opens Settings → Billing, where
 * TaskCreditsSection/AutonomousTaskBillingCard show the full wallet. Individual Pro Max accounts
 * only for now: Team/Enterprise members already see their org's shared balance prominently inside
 * Organization settings (AutonomousTaskBillingCard.tsx), and this component has no organization
 * context of its own to fetch an org-scoped balance honestly — showing nothing here for those
 * tiers beats guessing at an organizationId.
 */
export function TicketBalanceIndicator({ isGuest, onOpen }: { isGuest: boolean; onOpen: () => void }) {
  const ipc = useIpcBridge();
  const [eligible, setEligible] = useState(false);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);

  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    ipc
      .billingGetSubscription()
      .then((s) => {
        if (cancelled) return;
        setEligible(s.tier === 'proMax');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ipc, isGuest]);

  useEffect(() => {
    if (!eligible) return;
    let cancelled = false;
    const load = () => {
      autonomousTaskBillingService
        .getTicketBalance(null)
        .then((b) => {
          if (!cancelled) setBalanceUsd(b.balanceUsd);
        })
        .catch(() => {});
    };
    load();
    ipc.onTaskCreditsPurchased(load);
    return () => {
      cancelled = true;
    };
  }, [eligible, ipc]);

  if (isGuest || !eligible || balanceUsd === null) return null;

  return (
    <button type="button" className={styles.walletIndicator} onClick={onOpen} title="Autonomous Ticket Balance">
      <span className={styles.walletIndicatorIcon} aria-hidden="true">💳</span>
      <span>${balanceUsd.toFixed(2)}</span>
    </button>
  );
}
