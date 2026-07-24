import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';

/** The one real, user-controllable desktop notification PawOS sends today. */
export function NotificationsSection() {
  const [settings, setSettingsState] = useState<SettingsState | null>(null);

  useEffect(() => {
    ipc.settingsGet().then(setSettingsState).catch(() => {});
  }, []);

  const update = async (patch: Partial<SettingsState>) => {
    setSettingsState((s) => (s ? { ...s, ...patch } : s));
    await ipc.settingsSet(patch);
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Desktop notifications</h3>
      <label className={styles.settingsToggleRow}>
        <span>Notify me when a task finishes while I'm away</span>
        <input
          type="checkbox"
          checked={settings?.notifyOnTaskComplete ?? true}
          onChange={(e) => update({ notifyOnTaskComplete: e.target.checked })}
        />
      </label>
      <p className={styles.cardBody} style={{ marginTop: 8 }}>
        Only fires when the PawOS window isn't focused — never while you're already watching Paw work.
      </p>
    </div>
  );
}
