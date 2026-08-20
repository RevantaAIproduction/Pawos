import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { autonomousTaskBillingService } from '../../organization/AutonomousTaskBillingService';
import { NativeBillingCheckoutModal, type NativeBillingCheckoutIntent } from '../billing/NativeBillingCheckoutModal';
import {
  MIN_TICKET_BALANCE_TOPUP_USD,
  MAX_TICKET_BALANCE_TOPUP_USD,
  TICKET_BALANCE_TOPUP_PRESETS_USD,
  getTicketUnitPriceUsd,
} from '../../../shared/organization/AutonomousTaskBillingTypes';
import type { TicketBalance, TicketBalanceTopup } from '../../../shared/organization/AutonomousTaskBillingTypes';
import type { TicketPricingConfig } from '../../../shared/billing/BillingTypes';

type WalletState = 'loading' | 'error' | 'normal' | 'low' | 'empty';

function walletStateFor(balanceUsd: number, nextTicketPrice: number): WalletState {
  if (balanceUsd <= 0) return 'empty';
  if (balanceUsd < nextTicketPrice * 2) return 'low';
  return 'normal';
}

function useOutsideClick(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    }
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

/**
 * Persistent Autonomous Work Ticket Wallet indicator — always visible in
 * the Dashboard top-right bar regardless of subscription tier.
 *
 * Go/Pro: locked indicator (not openable). Clicking shows an eligibility
 * message with an upgrade path but never opens a wallet or purchase flow.
 *
 * Pro Max / Team / Enterprise: fully interactive. Clicking opens a compact
 * popover showing the real Ticket Balance, wallet state, and a top-up flow
 * that creates the existing Razorpay Order through pawos-web. Never represents Paw
 * Compute as dollars or Ticket Balance as PC units — the two wallets are
 * completely separate and must never be conflated.
 *
 * Eligibility comes from the authoritative main-process EntitlementService
 * via IPC (entitlementIsFeatureAvailable) — never from a renderer-only tier
 * string the caller could spoof.
 */
export function TicketBalanceIndicator({
  isGuest,
  onOpen,
  onRequestUpgrade,
}: {
  isGuest: boolean;
  onOpen: () => void;
  onRequestUpgrade?: () => void;
}) {
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [walletState, setWalletState] = useState<WalletState>('loading');
  const [balance, setBalance] = useState<TicketBalance | null>(null);
  const [nextTicketPrice, setNextTicketPrice] = useState(5.0);
  const [pricingConfig, setPricingConfig] = useState<TicketPricingConfig>({
    topupPresetsUsd: [...TICKET_BALANCE_TOPUP_PRESETS_USD],
    minTopupUsd: MIN_TICKET_BALANCE_TOPUP_USD,
    maxTopupUsd: MAX_TICKET_BALANCE_TOPUP_USD,
  });
  const [recentTopups, setRecentTopups] = useState<TicketBalanceTopup[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [eligibilityPopoverOpen, setEligibilityPopoverOpen] = useState(false);
  const [amountInput, setAmountInput] = useState(String(TICKET_BALANCE_TOPUP_PRESETS_USD[0]));
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutIntent, setCheckoutIntent] = useState<NativeBillingCheckoutIntent | null>(null);
  const [loadError, setLoadError] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => {
    setPopoverOpen(false);
    setEligibilityPopoverOpen(false);
  }, []);

  useOutsideClick(wrapperRef, closeAll);

  const loadBalance = useCallback(() => {
    if (isGuest) return;
    setLoadError(false);
    Promise.all([
      ipc.entitlementIsFeatureAvailable('autonomousTaskBilling'),
      ipc.billingGetTicketPricingConfig(),
    ])
      .then(([elig, pricing]) => {
        setEligible(elig);
        setPricingConfig(pricing);
        if (!elig) {
          setWalletState('normal'); // locked — state doesn't matter for display
          return;
        }
        return Promise.all([
          autonomousTaskBillingService.getTicketBalance(null),
          autonomousTaskBillingService.listTopups(null, 5),
        ]).then(([bal, topups]) => {
          const price = getTicketUnitPriceUsd(bal.ticketsUsedCount + 1);
          setBalance(bal);
          setNextTicketPrice(price);
          setRecentTopups(topups);
          setWalletState(walletStateFor(bal.balanceUsd, price));
        });
      })
      .catch(() => {
        setLoadError(true);
        setWalletState('error');
      });
  }, [isGuest]);

  useEffect(() => {
    if (isGuest) return;
    loadBalance();
    ipc.onTaskCreditsPurchased(() => loadBalance());
  }, [isGuest, loadBalance]);

  async function handleAddFunds() {
    const parsed = Number.parseFloat(amountInput);
    if (!Number.isFinite(parsed) || parsed < pricingConfig.minTopupUsd) {
      setCheckoutError(`Minimum top-up is $${pricingConfig.minTopupUsd}.`);
      return;
    }
    if (parsed > pricingConfig.maxTopupUsd) {
      setCheckoutError(`Maximum top-up is $${pricingConfig.maxTopupUsd.toLocaleString()}.`);
      return;
    }
    setCheckoutError(null);
    setCheckoutMessage(null);
    setCheckoutBusy(false);
    setCheckoutIntent({ kind: 'credits', amountUsd: parsed, title: 'Ticket Wallet' });
  }

  if (isGuest) return null;

  // ── Still loading eligibility ───────────────────────────────────────────

  if (eligible === null) {
    return (
      <div className={styles.walletPopoverWrapper} ref={wrapperRef}>
        <div className={styles.walletIndicator} aria-label="Ticket Wallet loading">
          <span className={styles.walletIndicatorIcon} aria-hidden>🪙</span>
          <span className={styles.walletAmountLoading}>…</span>
        </div>
      </div>
    );
  }

  // ── Go / Pro — locked ───────────────────────────────────────────────────

  if (!eligible) {
    return (
      <div className={styles.walletPopoverWrapper} ref={wrapperRef}>
        <button
          type="button"
          className={styles.walletIndicatorLocked}
          data-clickable="true"
          onClick={() => setEligibilityPopoverOpen((v) => !v)}
          aria-label="Ticket Wallet — Autonomous Work requires Pro Max or higher"
          aria-expanded={eligibilityPopoverOpen}
          aria-haspopup="dialog"
        >
          <span className={styles.walletIndicatorIcon} aria-hidden>🪙</span>
          <span>Ticket Wallet</span>
          <span className={styles.walletLockBadge} aria-hidden>🔒 Pro Max+</span>
        </button>
        {eligibilityPopoverOpen && (
          <div
            className={styles.walletEligibilityPopover}
            role="dialog"
            aria-label="Autonomous Work eligibility"
          >
            <p className={styles.walletEligibilityText}>
              Autonomous Work is available on <strong>Pro Max</strong> and higher tiers.
              Upgrade your plan to unlock the Ticket Wallet and start autonomous engineering tasks.
            </p>
            {onRequestUpgrade && (
              <button
                type="button"
                className={styles.walletUpgradeLink}
                onClick={() => { closeAll(); onRequestUpgrade(); }}
              >
                View upgrade options →
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Eligible — wallet indicator ─────────────────────────────────────────

  const balanceUsd = balance?.balanceUsd ?? 0;
  const hasError = loadError || walletState === 'error';

  function walletAmountClass() {
    if (hasError) return styles.walletAmountError;
    if (walletState === 'loading') return styles.walletAmountLoading;
    if (walletState === 'empty') return styles.walletAmountEmpty;
    if (walletState === 'low') return styles.walletAmountLow;
    return styles.walletAmountNormal;
  }

  function indicatorLabel() {
    if (hasError) return 'Error';
    if (walletState === 'loading') return '…';
    return `$${balanceUsd.toFixed(2)}`;
  }

  return (
    <>
    <div className={styles.walletPopoverWrapper} ref={wrapperRef}>
      {/* Wallet pill indicator */}
      <button
        type="button"
        className={styles.walletIndicator}
        onClick={() => { setPopoverOpen((v) => !v); setEligibilityPopoverOpen(false); }}
        aria-label={`Ticket Wallet: ${indicatorLabel()}`}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
      >
        <span className={styles.walletIndicatorIcon} aria-hidden>🪙</span>
        <span className={walletAmountClass()}>{indicatorLabel()}</span>
        {walletState === 'low' && <span className={styles.walletLowBadge} aria-label="Low balance">Low</span>}
        {walletState === 'empty' && <span className={styles.walletEmptyCta} aria-label="Balance empty">Add Credits</span>}
      </button>

      {/* Full wallet popover */}
      {popoverOpen && (
        <div
          className={styles.walletPopover}
          role="dialog"
          aria-label="Ticket Wallet"
        >
          <div className={styles.walletPopoverHeader}>
            <span className={styles.walletPopoverTitle}>🪙 Ticket Wallet</span>
            <button
              type="button"
              className={styles.walletPopoverClose}
              onClick={closeAll}
              aria-label="Close wallet"
            >
              ✕
            </button>
          </div>

          <div className={styles.walletPopoverBody}>
            {/* Balance */}
            {hasError ? (
              <>
                <p className={styles.walletPopoverError}>Unable to load wallet balance.</p>
                <button
                  type="button"
                  className={styles.walletRetryBtn}
                  onClick={loadBalance}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div>
                  <div className={styles.walletSectionLabel}>Autonomous Work Balance</div>
                  <div className={styles.walletBalanceRow}>
                    <span className={`${styles.walletBalanceFigure} ${walletState === 'low' ? styles.walletBalanceFigureLow : walletState === 'empty' ? styles.walletBalanceFigureEmpty : ''}`}>
                      ${balanceUsd.toFixed(2)}
                    </span>
                    <span className={styles.walletBalanceSub}>USD</span>
                    {walletState === 'low' && <span className={styles.walletLowBadge}>Low balance</span>}
                  </div>
                  {walletState === 'empty' && (
                    <p style={{ fontSize: 12, color: '#e08c8c', marginTop: 4 }}>
                      Add credits to start autonomous engineering tasks.
                    </p>
                  )}
                </div>

                {/* Wallet notice — separation from Paw Compute */}
                <div className={styles.walletNote}>
                  <span className={styles.walletNoteEmphasis}>Autonomous Work</span> uses this wallet.
                  {' '}Normal chat, coding help, research, and browser tasks use{' '}
                  <span className={styles.walletNoteEmphasis}>Paw Compute</span> — a separate allowance.
                  These wallets are never mixed.
                </div>

                {/* Add Credits */}
                <div>
                  <div className={styles.walletSectionLabel}>Add Credits</div>
                  <div className={styles.walletPresetRow}>
                    {pricingConfig.topupPresetsUsd.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`${styles.walletPreset} ${amountInput === String(n) ? styles.walletPresetActive : ''}`}
                        onClick={() => setAmountInput(String(n))}
                        aria-pressed={amountInput === String(n)}
                      >
                        ${n}
                      </button>
                    ))}
                  </div>
                  <div className={styles.walletCustomRow} style={{ marginTop: 8 }}>
                    <span className={styles.walletCurrencySymbol}>$</span>
                    <input
                      className={styles.walletCustomInput}
                      type="number"
                      min={pricingConfig.minTopupUsd}
                      max={pricingConfig.maxTopupUsd}
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      aria-label="Custom top-up amount in USD"
                    />
                    <button
                      type="button"
                      className={styles.walletAddBtn}
                      disabled={checkoutBusy}
                      onClick={handleAddFunds}
                    >
                      {checkoutBusy ? 'Opening…' : 'Add Credits'}
                    </button>
                  </div>
                  <div className={styles.walletMinNote} style={{ marginTop: 4 }}>
                    Minimum ${pricingConfig.minTopupUsd} · Maximum ${pricingConfig.maxTopupUsd.toLocaleString()}
                  </div>
                  {checkoutError && <p className={styles.walletPopoverError} style={{ marginTop: 6 }}>{checkoutError}</p>}
                  {checkoutMessage && <p className={styles.walletPopoverSuccess} style={{ marginTop: 6 }}>{checkoutMessage}</p>}
                </div>

                {/* Recent top-ups */}
                {recentTopups.length > 0 && (
                  <div>
                    <div className={styles.walletSectionLabel}>Recent top-ups</div>
                    {recentTopups.map((t) => (
                      <div key={t.id} className={styles.walletTopupRow}>
                        <span className={styles.walletTopupAmount}>+${t.amountUsd.toFixed(2)}</span>
                        <span>{new Date(t.toppedUpAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={styles.walletRetryBtn}
                      style={{ marginTop: 8 }}
                      onClick={() => { closeAll(); onOpen(); }}
                    >
                      Full history →
                    </button>
                  </div>
                )}

                {/* Paw Compute separation reminder */}
                <div className={styles.walletComputeNote}>
                  Paw Compute rolling limits are shown in Settings → Billing — separate from this wallet.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
    {checkoutIntent && (
      <NativeBillingCheckoutModal
        intent={checkoutIntent}
        onClose={() => setCheckoutIntent(null)}
        onSuccess={() => {
          setCheckoutIntent(null);
          setCheckoutMessage('Payment verified. Balance updated.');
          loadBalance();
        }}
      />
    )}
    </>
  );
}
