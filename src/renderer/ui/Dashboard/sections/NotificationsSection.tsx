import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';
import { Toggle } from '../Toggle';

/** The one real, user-controllable desktop notification PawOS sends today, plus an honest placeholder for mobile. */
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
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Desktop notifications</h3>
        <label className={styles.settingsToggleRow}>
          <span>Notify me when a task finishes while I'm away</span>
          <Toggle
            checked={settings?.notifyOnTaskComplete ?? true}
            onChange={(checked) => update({ notifyOnTaskComplete: checked })}
          />
        </label>
        <p className={styles.cardBody} style={{ marginTop: 8 }}>
          Only fires when the PawOS window isn't focused — never while you're already watching Paw work.
        </p>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Mobile notifications</h3>
        <label className={styles.settingsToggleRow}>
          <span>Notify me on my phone when I'm away from this PC</span>
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>
        <p className={styles.cardBody} style={{ marginTop: 8 }}>
          There's no PawOS mobile companion yet, so this can't send anything to a phone today —
          it's shown here so it's ready the moment that ships, not to imply it already works.
        </p>
      </div>
    </div>
  );
}
