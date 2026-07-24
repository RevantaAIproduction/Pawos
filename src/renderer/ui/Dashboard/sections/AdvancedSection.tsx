import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';

type ConnectorStatus = { kind: string; id: string; displayName: string; configured: boolean; detail?: string };

/**
 * Local capability preferences — not purchased plans. Migrated from the
 * companion overlay's own legacy SettingsPanel.tsx, which only the overlay
 * (not the Dashboard) could reach; kept here as the one real home for them.
 */
export function AdvancedSection() {
  const [codingMode, setCodingModeState] = useState<'go' | 'pro'>('go');
  const [infraMode, setInfraModeState] = useState<'investigate' | 'full'>('investigate');
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);

  useEffect(() => {
    ipc.actionExecute({ type: 'getCodingMode' }).then((result) => {
      if (result.ok) {
        const preferences = (result.data as { preferences?: { mode: 'go' | 'pro' } } | undefined)?.preferences;
        if (preferences) setCodingModeState(preferences.mode);
      }
    });
    ipc.actionExecute({ type: 'getInfraMode' }).then((result) => {
      if (result.ok) {
        const preferences = (result.data as { preferences?: { mode: 'investigate' | 'full' } } | undefined)?.preferences;
        if (preferences) setInfraModeState(preferences.mode);
      }
    });
    ipc.actionExecute({ type: 'listConfiguredInfraConnectors' }).then((result) => {
      if (result.ok) {
        const data = result.data as { connectors: ConnectorStatus[]; cliTools: ConnectorStatus[] } | undefined;
        if (data) setConnectors([...data.connectors, ...data.cliTools]);
      }
    });
  }, []);

  const changeCodingMode = async (mode: 'go' | 'pro') => {
    const result = await ipc.actionExecute({ type: 'setCodingMode', mode });
    if (result.ok) setCodingModeState(mode);
  };

  const changeInfraMode = async (mode: 'investigate' | 'full') => {
    const result = await ipc.actionExecute({ type: 'setInfraMode', mode });
    if (result.ok) setInfraModeState(mode);
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Coding mode</h3>
        <p className={styles.cardBody}>
          Paw Go is planning &amp; analysis only (read-only Coding Canvas, no execution). Paw Pro
          unlocks full code generation, execution, builds, tests, and browser preview.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className={codingMode === 'go' ? styles.chipActive : styles.chip}
            onClick={() => changeCodingMode('go')}
          >
            Paw Go — planning &amp; analysis
          </button>
          <button
            type="button"
            className={codingMode === 'pro' ? styles.chipActive : styles.chip}
            onClick={() => changeCodingMode('pro')}
          >
            Paw Pro — full execution
          </button>
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Infrastructure mode</h3>
        <p className={styles.cardBody}>
          Investigate is read-only (tickets, deployment status, health checks). Full also allows
          deploys and rollbacks, always with your explicit confirmation first.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className={infraMode === 'investigate' ? styles.chipActive : styles.chip}
            onClick={() => changeInfraMode('investigate')}
          >
            Investigate — read-only
          </button>
          <button
            type="button"
            className={infraMode === 'full' ? styles.chipActive : styles.chip}
            onClick={() => changeInfraMode('full')}
          >
            Full — deploy &amp; rollback
          </button>
        </div>
        {connectors.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {connectors.map((c) => (
              <span key={`${c.kind}-${c.id}`} className={styles.cardBody}>
                {c.configured ? '●' : '○'} {c.displayName}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
