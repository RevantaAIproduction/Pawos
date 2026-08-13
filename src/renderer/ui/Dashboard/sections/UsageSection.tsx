import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { useCompanionProfiles } from '../../../companion/manager/useCompanionProfiles';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { EntitlementSnapshot } from '../../../../shared/billing/BillingTypes';
import { formatPawComputeSummary, formatPlanAndRuntimeSummary } from '../../../billing/EntitlementDisplay';

/**
 * Real usage numbers only. Paw Compute comes from the entitlement snapshot,
 * companion count comes from the profile store, and storage stays "Not tracked
 * yet" because no real measurement exists.
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
        <h3 className={styles.cardTitle}>Account required</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Usage is tracked for authenticated PawOS accounts. Create a free Paw Go account to view Paw Compute.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} onClick={onGoToAccount}>
          Create free account
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Paw Compute</h3>
      <div className={styles.grid} style={{ marginTop: 8 }}>
        <div>
          <p className={styles.cardBody}>Usage</p>
          <p className={styles.cardTitle}>{formatPawComputeSummary(entitlement)}</p>
        </div>
        <div>
          <p className={styles.cardBody}>Plan & Runtime Access</p>
          <p className={styles.cardTitle}>{formatPlanAndRuntimeSummary(entitlement)}</p>
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
