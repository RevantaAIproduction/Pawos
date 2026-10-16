import React from 'react';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

/** PawOS's own contact-sales page (pawos-web/src/app/support/sales). */
export const SALES_CONTACT_URL = 'https://pawos.revantaai.com/support/sales';

/** What the amount field says when a purchase is over the most one transaction can be. */
export function creditsLimitMessage(maxUsd: number): string {
  return `One purchase can add up to $${maxUsd.toLocaleString('en-US')}.`;
}

/**
 * Shown under a credits amount that is over the per-transaction maximum: the limit is a limit on one
 * purchase, so the way to more is a conversation with sales — never several purchases made for the
 * customer. It only opens the sales page; it changes nothing about the purchase.
 */
export function CreditsLimitSalesNote({ maxUsd, onContactSales }: { maxUsd: number; onContactSales?: () => void }) {
  const contact = onContactSales ?? (() => void ipc.actionExecute({ type: 'openUrl', url: SALES_CONTACT_URL }));
  return (
    <div
      role="status"
      data-testid="credits-limit-contact-sales"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid rgba(var(--pawos-overlay-rgb), 0.14)',
        background: 'rgba(var(--pawos-overlay-rgb), 0.05)',
        color: 'rgba(var(--pawos-overlay-rgb), 0.75)',
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, opacity: 0.7 }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16.5v.01" />
      </svg>
      <span>
        {creditsLimitMessage(maxUsd)} For larger credit requirements, contact Revanta AI sales.{' '}
        <button
          type="button"
          onClick={contact}
          style={{ padding: 0, border: 'none', background: 'none', color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Contact sales
        </button>
      </span>
    </div>
  );
}
