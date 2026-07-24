import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { EntitlementSnapshot } from '../../../../shared/billing/BillingTypes';

/**
 * Real usage numbers only — Runtime Usage and Companion Usage come from the
 * entitlement service and companion profile store. Storage Usage stays
 * "Not tracked yet" since no real measurement exists. Guests never see
 * usage — there's no account to track usage against yet.
 */
export function UsageSection({ user, onGoToAccount }: { user: AuthUser; onGoToAccount: () => void }) {
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot | null>(null);
  const { profiles } = useCompanionProfiles();

  useEffect(() => {
    if (user.isGuest) return;
    ipc.entitlementGetSnapshot().then(setEntitlement).catch(() => {});
  }, [user.isGuest]);

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No usage tracked for guest sessions</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Usage is only tracked once you have a real account. Create a free account to start
          tracking runtime, companion, and storage usage on Paw Go.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} onClick={onGoToAccount}>
          Create free account
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Usage Statistics</h3>
      <div className={styles.grid} style={{ marginTop: 8 }}>
        <div>
          <p className={styles.cardBody}>Runtime Usage</p>
          <p className={styles.cardTitle}>{entitlement?.creditsUsedThisPeriod ?? 0} AI turns this period</p>
        </div>
        <div>
          <p className={styles.cardBody}>Companion Usage</p>
          <p className={styles.cardTitle}>
            {profiles.length} companion{profiles.length === 1 ? '' : 's'}
          </p>
        </div>
        <div>
          <p className={styles.cardBody}>Storage Usage</p>
          <p className={styles.cardTitle}>Not tracked yet</p>
        </div>
      </div>
    </div>
  );
}
