import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';

/**
 * Global desktop-companion behavior toggles only — personality, memory, and
 * per-companion voice/appearance are edited in Companion Studio, not here.
 */
export function CompanionBehaviorSection({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
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
        <h3 className={styles.cardTitle}>Desktop reactions</h3>
        <label className={styles.settingsToggleRow}>
          <span>React to keyboard activity</span>
          <input
            type="checkbox"
            checked={settings?.enableKeyboardReactions ?? true}
            onChange={(e) => update({ enableKeyboardReactions: e.target.checked })}
          />
        </label>
        <label className={styles.settingsToggleRow}>
          <span>React to mouse activity</span>
          <input
            type="checkbox"
            checked={settings?.enableMouseReactions ?? true}
            onChange={(e) => update({ enableMouseReactions: e.target.checked })}
          />
        </label>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Personality, memory &amp; appearance</h3>
        <p className={styles.cardBody}>
          Edit your companion's personality, voice, memory, and 3D appearance in Companion Studio.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={onOpenCompanionStudio}>
          Open Companion Studio
        </button>
      </div>
    </div>
  );
}
