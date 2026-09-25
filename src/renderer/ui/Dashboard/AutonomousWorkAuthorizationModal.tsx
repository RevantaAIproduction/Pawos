import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { TICKET_CANCELLATION_FEE_USD, TICKET_RETRY_FEE_USD, TICKET_SIZE_PRICE_FROM_USD } from '../../../shared/organization/AutonomousTaskBillingTypes';

export type AuthorizationRequest = {
  ticketId: string | null;
  ticketTitle: string | null;
  balanceUsd: number;
  nextTicketPriceUsd: number;
  /** Resolve callback — true = authorized, false = cancelled. */
  resolve: (authorized: boolean) => void;
  /** If set, a "handled" flag on the event detail to signal UI is mounted. */
  _handled?: true;
};

const STAGES = [
  'Repository analysis',
  'Code changes',
  'Tests / validation',
  'Browser verification',
  'Screenshots / evidence',
  'Deployment (when required)',
  'Ticket completion',
] as const;

/**
 * Pre-execution authorization screen shown before any billable Autonomous
 * Work ticket begins. Displays the ticket, current charge ($5 flat — the
 * real backend rate; complexity pricing is built but not wired to the
 * charging RPC yet and must never be presented as the actual charge),
 * wallet balance, and the list of stages PawOS will run.
 *
 * Architecture gap note: the backend does not yet support pre-execution
 * balance reservation or cap-exceeded pausing — those sections report
 * BLOCKED. The authorization structure is forward-compatible: once the
 * backend adds a reservation RPC, this modal's authorize path can await it
 * before resolving true, without redesigning the component.
 */
export function AutonomousWorkAuthorizationModal({
  request,
  onAddFunds,
}: {
  request: AuthorizationRequest;
  onAddFunds: () => void;
}) {
  const { ticketId, ticketTitle, balanceUsd, nextTicketPriceUsd, resolve } = request;
  const sufficient = balanceUsd >= nextTicketPriceUsd;

  function cancel() {
    resolve(false);
  }

  function authorize() {
    if (!sufficient) return;
    resolve(true);
  }

  return (
    <div
      className={styles.authModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label="Authorize Autonomous Work"
    >
      <div className={styles.authModal}>
        <div className={styles.authModalHeader}>
          <div className={styles.authModalEyebrow}>Autonomous Work</div>
          <div className={styles.authModalTitle}>
            {sufficient ? 'Authorize ticket execution' : 'Insufficient Ticket Wallet balance'}
          </div>
        </div>

        <div className={styles.authModalBody}>
          {/* Ticket identity */}
          <div className={styles.authTicketInfo}>
            {ticketId && <div className={styles.authTicketId}>{ticketId}</div>}
            <div className={styles.authTicketTitle}>
              {ticketTitle ?? ticketId ?? 'Autonomous Engineering Task'}
            </div>
          </div>

          {/* Billing block */}
          <div className={styles.authBillingBlock}>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Charged when complete</div>
              <div className={styles.authBillingValue}>{`$${TICKET_SIZE_PRICE_FROM_USD.toFixed(2)}+`}</div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Wallet balance</div>
              <div className={`${styles.authBillingValue} ${sufficient ? styles.authBillingValueOk : styles.authBillingValueWarn}`}>
                {balanceUsd < 0 ? `-$${Math.abs(balanceUsd).toFixed(2)}` : `$${balanceUsd.toFixed(2)}`}
              </div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Needed to start</div>
              <div className={styles.authBillingValue}>${nextTicketPriceUsd.toFixed(2)}</div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Each automatic retry</div>
              <div className={styles.authBillingValue}>${TICKET_RETRY_FEE_USD.toFixed(2)}</div>
            </div>
          </div>

          {/* Insufficient balance */}
          {!sufficient && (
            <div className={styles.authInsufficientBanner}>
              <div className={styles.authInsufficientTitle}>Insufficient Ticket Wallet balance</div>
              <div className={styles.authInsufficientRow}>
                <span>Required</span>
                <span className={styles.authInsufficientValue}>${nextTicketPriceUsd.toFixed(2)}</span>
              </div>
              <div className={styles.authInsufficientRow}>
                <span>Available</span>
                <span className={styles.authInsufficientValue}>${balanceUsd.toFixed(2)}</span>
              </div>
              <button
                type="button"
                className={styles.authAddFundsBtn}
                onClick={() => { cancel(); onAddFunds(); }}
              >
                Add Credits
              </button>
            </div>
          )}

          {/* Wallet notice */}
          <div className={styles.authWalletNotice}>
            <span className={styles.authWalletNoticeEmphasis}>Autonomous Work uses your Ticket Wallet.</span>
            {' '}A completed ticket is priced by the size of the change: $1 for a one-line fix, $5 for 1–3 files,
            $7.50 for 4–9, $10 for 10–20, $15 for 21–30, $20–$30 for 31–50, and more for larger changes. If a run
            fails it is retried automatically — each retry costs ${TICKET_RETRY_FEE_USD.toFixed(2)}; a failed first
            attempt costs nothing. Cancelling a started ticket costs ${TICKET_CANCELLATION_FEE_USD.toFixed(2)}. A
            large change can take your balance below zero; top up to clear it before the next ticket.
          </div>

          {/* Stages */}
          {sufficient && (
            <div className={styles.authStagesList}>
              <div className={styles.authStagesLabel}>Execution stages</div>
              {STAGES.map((stage) => (
                <div key={stage} className={styles.authStageItem}>
                  <span className={styles.authStageDot} aria-hidden />
                  {stage}
                </div>
              ))}
            </div>
          )}

        </div>

        <div className={styles.authModalFooter}>
          <button
            type="button"
            className={styles.authCancelBtn}
            onClick={cancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.authAuthorizeBtn}
            disabled={!sufficient}
            onClick={authorize}
            aria-disabled={!sufficient}
          >
            {sufficient ? `Authorize $${nextTicketPriceUsd.toFixed(2)}` : 'Insufficient balance'}
          </button>
        </div>
      </div>
    </div>
  );
}

type ActiveRequest = {
  detail: AuthorizationRequest;
  wrappedResolve: (authorized: boolean) => void;
};

/**
 * Mount this in the Dashboard shell to handle authorization requests
 * dispatched by AutonomousTaskBillingGate before any run starts.
 */
export function useAutonomousWorkAuthorization(onAddFunds: () => void): {
  modal: React.ReactNode;
} {
  const [active, setActive] = useState<ActiveRequest | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<AuthorizationRequest>).detail;
      if (!detail || typeof detail.resolve !== 'function') return;
      detail._handled = true;
      const originalResolve = detail.resolve;
      const wrappedResolve = (authorized: boolean) => {
        originalResolve(authorized);
        setActive(null);
      };
      setActive({ detail: { ...detail, resolve: wrappedResolve }, wrappedResolve });
    }
    window.addEventListener('paw:requestAutonomousAuthorization', handler);
    return () => window.removeEventListener('paw:requestAutonomousAuthorization', handler);
  }, []);

  const modal = active ? (
    <AutonomousWorkAuthorizationModal
      request={active.detail}
      onAddFunds={() => {
        active.wrappedResolve(false);
        onAddFunds();
      }}
    />
  ) : null;

  return { modal };
}
