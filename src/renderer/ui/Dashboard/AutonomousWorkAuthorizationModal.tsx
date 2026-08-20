import React, { useEffect, useState } from 'react';
import styles from './dashboard.module.css';

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
              <div className={styles.authBillingLabel}>Current charge</div>
              <div className={styles.authBillingValue}>${nextTicketPriceUsd.toFixed(2)}</div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Wallet balance</div>
              <div className={`${styles.authBillingValue} ${sufficient ? styles.authBillingValueOk : styles.authBillingValueWarn}`}>
                ${balanceUsd.toFixed(2)}
              </div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Maximum authorization</div>
              <div className={styles.authBillingValue}>${nextTicketPriceUsd.toFixed(2)}</div>
            </div>
            <div className={styles.authBillingItem}>
              <div className={styles.authBillingLabel}>Remaining after</div>
              <div className={`${styles.authBillingValue} ${(balanceUsd - nextTicketPriceUsd) < 0 ? styles.authBillingValueWarn : ''}`}>
                ${Math.max(0, balanceUsd - nextTicketPriceUsd).toFixed(2)}
              </div>
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
            {' '}$5.00 is charged per completed ticket at the current volume-tiered rate.
            Tasks that fail, are cancelled, or are denied approval are not charged.
            Normal Paw Compute is not consumed in place of Ticket Wallet balance.
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

          {/* Cap note */}
          {sufficient && (
            <div className={styles.authCapNote}>
              PawOS will not exceed the authorized amount ($
              {nextTicketPriceUsd.toFixed(2)}) without your approval.
              Cap-exceeded pausing requires a backend reservation mechanism
              (currently BLOCKED — implementation pending).
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
