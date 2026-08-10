import React, { useEffect, useMemo, useState } from 'react';
import styles from './settingsPanel.module.css';
import type { SettingsState } from '../../services/settings/SettingsManager';
import { DEFAULT_SETTINGS } from '../../services/settings/SettingsManager';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import { Toggle } from '../Dashboard/Toggle';

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
          <input type="range" min={0.5} max={1.8} step={0.05} value={1} disabled onChange={() => {}} />
        </label>

        <label className={styles.row}>
          Sound volume
          <input type="range" min={0} max={1} step={0.01} value={0.6} disabled onChange={() => {}} />
        </label>

        <label className={styles.row}>
          Muted
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>

        <label className={styles.row}>
          Keyboard reactions
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>

        <label className={styles.row}>
          Mouse reactions
          <Toggle checked={false} onChange={() => {}} disabled />
        </label>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: -4 }}>
          The five controls above have no effect today — the live 3D companion doesn't yet read
          animation speed, sound volume/mute, or keyboard/mouse reaction settings. Shown here so
          they're ready the moment that's wired up, not to imply they already work.
        </p>

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
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Selecting "Paw Pro" here only takes effect if your account's subscription is actually
            Paw Pro or higher — otherwise coding actions will still be blocked until you upgrade.
          </span>
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

