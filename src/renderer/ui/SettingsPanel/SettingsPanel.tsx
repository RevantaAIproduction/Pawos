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
  const [codingMode, setCodingModeState] = useState<'go' | 'pro'>('go');
  const [infraMode, setInfraModeState] = useState<'investigate' | 'full'>('investigate');
  const [infraConnectors, setInfraConnectors] = useState<{ kind: string; id: string; displayName: string; configured: boolean; detail?: string }[]>([]);

  useEffect(() => {
    ipc.getSettings().then((s) => setDraft(s));
    ipc.executeAction({ type: 'getCodingMode' }).then((result) => {
      if (result.ok) {
        const preferences = (result.data as { preferences?: { mode: 'go' | 'pro' } } | undefined)?.preferences;
        if (preferences) setCodingModeState(preferences.mode);
      }
    });
    ipc.executeAction({ type: 'getInfraMode' }).then((result) => {
      if (result.ok) {
        const preferences = (result.data as { preferences?: { mode: 'investigate' | 'full' } } | undefined)?.preferences;
        if (preferences) setInfraModeState(preferences.mode);
      }
    });
    ipc.executeAction({ type: 'listConfiguredInfraConnectors' }).then((result) => {
      if (result.ok) {
        const data = result.data as { connectors: typeof infraConnectors; cliTools: typeof infraConnectors } | undefined;
        if (data) setInfraConnectors([...data.connectors, ...data.cliTools]);
      }
    });
  }, []);

  const changeCodingMode = async (mode: 'go' | 'pro') => {
    const result = await ipc.executeAction({ type: 'setCodingMode', mode });
    if (result.ok) setCodingModeState(mode);
  };

  const changeInfraMode = async (mode: 'investigate' | 'full') => {
    const result = await ipc.executeAction({ type: 'setInfraMode', mode });
    if (result.ok) setInfraModeState(mode);
  };

  const save = async () => {
    await ipc.setSettings(draft);
    onClose();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>PawOS Settings</div>
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

        <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span>Coding mode</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            A local capability preference — not a purchased plan. Paw Go is planning &amp; analysis only
            (read-only Coding Canvas, no execution). Paw Pro unlocks full code generation, execution, builds, tests, and browser preview.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={codingMode === 'go' ? styles.primary : styles.secondary}
              onClick={() => changeCodingMode('go')}
              type="button"
            >
              Paw Go — planning &amp; analysis only
            </button>
            <button
              className={codingMode === 'pro' ? styles.primary : styles.secondary}
              onClick={() => changeCodingMode('pro')}
              type="button"
            >
              Paw Pro — full execution
            </button>
          </div>
        </div>

        <div className={styles.row} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span>Infrastructure mode</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            A local capability preference — not a purchased plan. Investigation mode is read-only (tickets,
            deployment status, health checks). Full mode also allows deploys and rollbacks, always with your
            explicit confirmation first.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={infraMode === 'investigate' ? styles.primary : styles.secondary}
              onClick={() => changeInfraMode('investigate')}
              type="button"
            >
              Investigate — read-only
            </button>
            <button
              className={infraMode === 'full' ? styles.primary : styles.secondary}
              onClick={() => changeInfraMode('full')}
              type="button"
            >
              Full — deploy &amp; rollback
            </button>
          </div>
          {infraConnectors.length > 0 && (
            <div style={{ fontSize: 12, opacity: 0.85, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
              {infraConnectors.map((c) => (
                <span key={`${c.kind}-${c.id}`}>
                  {c.configured ? '●' : '○'} {c.displayName}
                </span>
              ))}
            </div>
          )}
        </div>

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

