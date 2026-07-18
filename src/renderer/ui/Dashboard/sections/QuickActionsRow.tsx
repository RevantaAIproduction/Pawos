import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { useIpcBridge } from '../../../services/ipc/useIpcBridge';
import type { KnownAppId } from '../../../../shared/actions/ActionTypes';

const APPS: { id: KnownAppId; label: string }[] = [
  { id: 'vscode', label: 'Open VS Code' },
  { id: 'chrome', label: 'Open Chrome' },
  { id: 'explorer', label: 'Open File Explorer' },
];

export function QuickActionsRow() {
  const ipc = useIpcBridge();
  const [status, setStatus] = useState<string | null>(null);

  const run = async (appId: KnownAppId, label: string) => {
    setStatus(`${label}…`);
    const result = await ipc.executeAction({ type: 'openApp', appId });
    setStatus(result.ok ? `${label} ✓` : `${label} failed: ${result.reason}`);
    window.setTimeout(() => setStatus(null), 3000);
  };

  return (
    <div>
      <h3 className={styles.subheading}>Desktop actions</h3>
      <div className={styles.quickActions}>
        {APPS.map((app) => (
          <button key={app.id} type="button" className={styles.chip} onClick={() => run(app.id, app.label)}>
            {app.label}
          </button>
        ))}
      </div>
      {status && <p className={styles.cardBody} style={{ marginTop: 8 }}>{status}</p>}
    </div>
  );
}
