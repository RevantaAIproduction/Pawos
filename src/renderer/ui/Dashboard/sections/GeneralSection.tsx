import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';

/** Startup + version only — theme lives in ThemeSection.tsx, per-companion behavior lives under Companion/Voice. */
export function GeneralSection() {
  const [settings, setSettingsState] = useState<SettingsState | null>(null);
  const [version, setVersion] = useState('…');

  useEffect(() => {
    ipc.settingsGet().then(setSettingsState).catch(() => {});
    ipc.systemGetAppVersion().then(setVersion).catch(() => {});
  }, []);

  const toggleStartWithWindows = async (checked: boolean) => {
    setSettingsState((s) => (s ? { ...s, startWithWindows: checked } : s));
    await ipc.settingsSet({ startWithWindows: checked });
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Startup</h3>
        <label className={styles.settingsToggleRow}>
          <span>Start PawOS when Windows starts</span>
          <input
            type="checkbox"
            checked={settings?.startWithWindows ?? true}
            onChange={(e) => toggleStartWithWindows(e.target.checked)}
          />
        </label>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>About</h3>
        <p className={styles.cardBody}>PawOS version {version}</p>
      </div>
    </div>
  );
}
