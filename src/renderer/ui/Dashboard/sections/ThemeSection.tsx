import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';
import type { ThemeMode } from '../../../services/ipc/ipcTypes';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** App-wide chrome theme — applied live via AppRoot.tsx's useThemeSync(). */
export function ThemeSection() {
  const [settings, setSettingsState] = useState<SettingsState | null>(null);

  useEffect(() => {
    ipc.settingsGet().then(setSettingsState).catch(() => {});
  }, []);

  const setThemeMode = async (themeMode: ThemeMode) => {
    setSettingsState((s) => (s ? { ...s, themeMode } : s));
    await ipc.settingsSet({ themeMode });
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Theme</h3>
      <div className={styles.settingsToggleRow}>
        <span>Appearance</span>
        <div className={styles.quickActions}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.chip} ${settings?.themeMode === opt.value ? styles.chipActive : ''}`}
              onClick={() => setThemeMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
