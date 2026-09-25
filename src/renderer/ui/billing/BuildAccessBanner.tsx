import React, { useState } from 'react';
import styles from '../Dashboard/dashboard.module.css';
import type { EntitlementSnapshot } from '../../../shared/billing/BillingTypes';
import { describeBuildAccess, formatDate, formatTierLabel } from '../../billing/EntitlementDisplay';

const DISMISS_KEY = 'pawos.buildNoticeDismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(value: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, value);
  } catch {
    // best-effort — a restricted profile just shows the notice again next launch
  }
}

/**
 * App-wide PawOS Build notice: an approaching-expiry warning during the last
 * BUILD_EXPIRY_WARNING_DAYS of access, and a one-time "access ended" notice once Build has expired
 * or been revoked and the account has fallen back to its base tier. Dismissal is remembered per
 * grant end date.
 */
export function BuildAccessBanner({ entitlement }: { entitlement: EntitlementSnapshot | null }) {
  const display = describeBuildAccess(entitlement);
  const noticeKey =
    display.kind === 'active' && display.expiringSoon
      ? `expiring:${display.endsAt}`
      : display.kind === 'expired'
        ? `expired:${display.endsAt}`
        : display.kind === 'revoked'
          ? `revoked:${display.revokedAt ?? 'unknown'}`
          : null;
  const [dismissed, setDismissed] = useState<string | null>(readDismissed);

  if (!entitlement || !noticeKey || dismissed === noticeKey) return null;

  const baseLabel = formatTierLabel(entitlement.baseTier);
  let title: string;
  let body: string;
  if (display.kind === 'active') {
    title = display.daysLeft <= 1 ? 'Your PawOS Build access ends today' : `Your PawOS Build access ends in ${display.daysLeft} days`;
    body = `Access ends on ${formatDate(display.endsAt)}. After that your account returns to ${baseLabel}. Contact your program coordinator if you need more time.`;
  } else if (display.kind === 'expired') {
    title = 'Your PawOS Build access has ended';
    body = `Build access ended on ${formatDate(display.endsAt)}. Your account is now on ${baseLabel}.`;
  } else {
    title = 'Your PawOS Build access was removed';
    body = `Your account is now on ${baseLabel}. Contact your program coordinator if this is unexpected.`;
  }

  return (
    <div className={styles.card} role="status" data-testid="build-access-banner" style={{ margin: '0 0 16px', display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'rgba(var(--pawos-overlay-rgb), 0.7)' }}>{body}</div>
      </div>
      <button
        type="button"
        className={styles.dangerButton}
        onClick={() => {
          writeDismissed(noticeKey);
          setDismissed(noticeKey);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
