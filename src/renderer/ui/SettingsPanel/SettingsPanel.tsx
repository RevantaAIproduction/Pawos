import React, { useEffect, useMemo, useState } from 'react';
import styles from './settingsPanel.module.css';
import type { SettingsState } from '../../services/settings/SettingsManager';
import { DEFAULT_SETTINGS } from '../../services/settings/SettingsManager';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';

export function SettingsPanel({
  controller,
  onClose,
}: {
  controller: any;
  onClose: () => void;
}) {
  const ipc = useIpcBridge();

  const [draft, setDraft] = useState<SettingsState>(DEFAULT_SETTINGS);

  useEffect(() => {
    ipc.getSettings().then((s) => setDraft(s));
  }, []);

  const save = async () => {
    await ipc.setSettings(draft);
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>CompanionOS Settings</div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <label className={styles.row}>
          Animation speed
          <input
            type="range"
            min={0.5}
            max={1.8}
            step={0.05}
            value={draft.animationSpeed}
            onChange={(e) => setDraft((d) => ({ ...d, animationSpeed: Number(e.target.value) }))}
          />
        </label>

        <label className={styles.row}>
          Sound volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft.soundVolume}
            onChange={(e) => setDraft((d) => ({ ...d, soundVolume: Number(e.target.value) }))}
          />
        </label>

        <label className={styles.row}>
          Muted
          <input
            type="checkbox"
            checked={draft.muted}
            onChange={(e) => setDraft((d) => ({ ...d, muted: e.target.checked }))}
          />
        </label>

        <label className={styles.row}>
          Keyboard reactions
          <input
            type="checkbox"
            checked={draft.enableKeyboardReactions}
            onChange={(e) => setDraft((d) => ({ ...d, enableKeyboardReactions: e.target.checked }))}
          />
        </label>

        <label className={styles.row}>
          Mouse reactions
          <input
            type="checkbox"
            checked={draft.enableMouseReactions}
            onChange={(e) => setDraft((d) => ({ ...d, enableMouseReactions: e.target.checked }))}
          />
        </label>

        <div className={styles.actions}>
          <button className={styles.primary} onClick={save}>
            Save
          </button>
          <button className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

