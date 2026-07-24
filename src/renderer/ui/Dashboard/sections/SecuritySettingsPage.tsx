import React from 'react';
import styles from '../dashboard.module.css';

/** Honest placeholder — password change already lives in Account, and "sign out other devices" lives in Devices; this tab will grow around those once 2FA/audit-log work is built. */
export function SecuritySettingsPage({ onGoToAccount, onGoToDevices }: { onGoToAccount: () => void; onGoToDevices: () => void }) {
  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Password</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Change your password from Account settings.
        </p>
        <button type="button" className={styles.chip} style={{ marginTop: 10 }} onClick={onGoToAccount}>
          Go to Account
        </button>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Sessions</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Review and sign out other devices signed into this account from Devices settings.
        </p>
        <button type="button" className={styles.chip} style={{ marginTop: 10 }} onClick={onGoToDevices}>
          Go to Devices
        </button>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>More security controls are coming</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Two-factor authentication and an audit log aren't available yet.
        </p>
      </div>
    </div>
  );
}
