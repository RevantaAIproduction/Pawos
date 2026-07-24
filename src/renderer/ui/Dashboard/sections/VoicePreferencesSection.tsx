import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { SettingsState } from '../../../services/settings/SettingsManager';

/**
 * Global audio output only (volume/mute). Per-companion voice identity,
 * speed, and emotion (TTS provider selection) live in Companion Studio's
 * own Voice tab — CompanionEditorPanel.tsx — and aren't duplicated here.
 */
export function VoicePreferencesSection({ onOpenCompanionStudio }: { onOpenCompanionStudio: () => void }) {
  const [draft, setDraft] = useState<SettingsState | null>(null);

  useEffect(() => {
    ipc.settingsGet().then(setDraft).catch(() => {});
  }, []);

  const save = async () => {
    if (!draft) return;
    await ipc.settingsSet({ soundVolume: draft.soundVolume, muted: draft.muted });
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Sound</h3>
        <label className={styles.settingsSliderRow}>
          <span>Volume: {Math.round((draft?.soundVolume ?? 0.6) * 100)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft?.soundVolume ?? 0.6}
            onChange={(e) => setDraft((d) => (d ? { ...d, soundVolume: Number(e.target.value) } : d))}
            onMouseUp={save}
            onTouchEnd={save}
          />
        </label>
        <label className={styles.settingsToggleRow}>
          <span>Mute all sound</span>
          <input
            type="checkbox"
            checked={draft?.muted ?? false}
            onChange={async (e) => {
              setDraft((d) => (d ? { ...d, muted: e.target.checked } : d));
              await ipc.settingsSet({ muted: e.target.checked });
            }}
          />
        </label>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Companion voice</h3>
        <p className={styles.cardBody}>
          Choose each companion's voice, speed, and emotion in Companion Studio → Edit → Voice.
        </p>
        <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={onOpenCompanionStudio}>
          Open Companion Studio
        </button>
      </div>
    </div>
  );
}
