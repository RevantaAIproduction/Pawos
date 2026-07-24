import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';

/** The one real performance-affecting control PawOS exposes today. */
export function PerformanceSection() {
  const [draft, setDraft] = useState<SettingsState | null>(null);

  useEffect(() => {
    ipc.settingsGet().then(setDraft).catch(() => {});
  }, []);

  const save = async () => {
    if (!draft) return;
    await ipc.settingsSet({ animationSpeed: draft.animationSpeed });
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Companion animation</h3>
      <label className={styles.settingsSliderRow}>
        <span>Animation speed: {(draft?.animationSpeed ?? 1).toFixed(2)}x</span>
        <input
          type="range"
          min={0.5}
          max={1.8}
          step={0.05}
          value={draft?.animationSpeed ?? 1}
          onChange={(e) => setDraft((d) => (d ? { ...d, animationSpeed: Number(e.target.value) } : d))}
          onMouseUp={save}
          onTouchEnd={save}
        />
      </label>
      <p className={styles.cardBody} style={{ marginTop: 8 }}>
        Lower speeds use less CPU for idle animations.
      </p>
    </div>
  );
}
