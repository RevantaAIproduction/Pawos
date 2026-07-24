import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

/** Honest — there's no automatic update-checking mechanism wired up yet. */
export function UpdatesSection() {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    ipc.systemGetAppVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>PawOS version {version}</h3>
      <p className={styles.cardBody} style={{ marginTop: 6 }}>
        Automatic update checks aren't available yet — check revantaai.com for the latest release.
      </p>
      <button
        type="button"
        className={styles.chip}
        style={{ marginTop: 10 }}
        onClick={() => ipc.actionExecute({ type: 'openUrl', url: 'https://revantaai.com' })}
      >
        Check for the latest release
      </button>
    </div>
  );
}
