import React, { useEffect, useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { describeUpdateStatus, nextUpdateStatus, type UpdateStatus, type UpdateStatusEvent } from './updateStatus';

/**
 * Settings > Updates.
 * - Direct download (NSIS): the existing electron-updater flow — check, download, Apply Update (restart to install).
 * - Microsoft Store (MSIX): the Store downloads and installs updates; the button opens it.
 */
export function UpdatesSection() {
  const [version, setVersion] = useState('…');
  const [distribution, setDistribution] = useState<'store' | 'direct' | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const statusRef = useRef<UpdateStatus>('idle');

  const apply = (event: UpdateStatusEvent | string) => {
    const next = nextUpdateStatus(statusRef.current, event);
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    ipc.systemGetAppVersion().then(setVersion).catch(() => {});
    ipc.systemGetDistribution().then(setDistribution).catch(() => setDistribution('direct'));
  }, []);

  // Direct build only: follow the same 'updater:state' events the sidebar's update button uses.
  useEffect(() => {
    if (distribution !== 'direct') return;
    return window.__pawos_ipc__.onUpdateState((state: string) => apply(state));
  }, [distribution]);

  const view = describeUpdateStatus(status);

  const onDirectClick = async () => {
    if (view.action === 'check') {
      apply({ type: 'check-started' });
      let ok = false;
      try {
        ok = (await window.__pawos_ipc__.checkForUpdates()) === true;
      } catch {
        ok = false;
      }
      apply({ type: 'check-finished', ok });
    } else if (view.action === 'install') {
      window.__pawos_ipc__.quitAndInstall();
    }
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>PawOS version {version}</h3>
      {distribution === 'store' && (
        <>
          {/* Microsoft Store (MSIX) build: the Store downloads and installs updates, not PawOS. */}
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            Updates are delivered by the Microsoft Store.
          </p>
          <button
            type="button"
            className={styles.chip}
            style={{ marginTop: 10 }}
            onClick={() => window.__pawos_ipc__.checkForUpdates()}
          >
            Check for Updates
          </button>
        </>
      )}
      {distribution === 'direct' && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            {view.message}
          </p>
          <button
            type="button"
            className={styles.chip}
            style={{ marginTop: 10 }}
            disabled={view.action === null}
            onClick={onDirectClick}
          >
            {view.buttonLabel}
          </button>
        </>
      )}
    </div>
  );
}
