import React, { useEffect, useRef, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { describeUpdateStatus, nextUpdateStatus, statusFromState, type UpdateStatus, type UpdateStatusEvent } from './updateStatus';

/**
 * Settings > Updates. PawOS also checks on its own after launch and every few hours, and notifies
 * when there is an update; this is where the user can check right now.
 * - Direct download (NSIS): check, download, then restart to install.
 * - Microsoft Store (MSIX): check against the Store; when a newer PawOS is there, "Update" opens
 *   PawOS's own Store page, which installs it.
 */
export function UpdatesSection() {
  const [version, setVersion] = useState('…');
  const [distribution, setDistribution] = useState<'store' | 'direct' | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const statusRef = useRef<UpdateStatus>('idle');

  const apply = (event: UpdateStatusEvent | string) => {
    const next = nextUpdateStatus(statusRef.current, event);
    statusRef.current = next;
    setStatus(next);
  };

  const refresh = () => {
    window.__pawos_ipc__
      .getUpdateState?.()
      .then((snapshot: { state: string; version: string | null } | undefined) => {
        if (!snapshot) return;
        const next = statusFromState(snapshot.state);
        // Keep this section's own "Checking…" until its check finishes.
        if (statusRef.current !== 'checking' || next !== 'idle') {
          statusRef.current = next;
          setStatus(next);
        }
        setNewVersion(snapshot.version ?? null);
      })
      .catch(() => {});
  };

  useEffect(() => {
    ipc.systemGetAppVersion().then(setVersion).catch(() => {});
    ipc.systemGetDistribution().then(setDistribution).catch(() => setDistribution('direct'));
    refresh();
    return window.__pawos_ipc__.onUpdateState((state: string) => {
      apply(state);
      refresh();
    });
  }, []);

  const view = describeUpdateStatus(status, newVersion);

  const onClick = async () => {
    if (view.action === 'check') {
      apply({ type: 'check-started' });
      let ok = false;
      try {
        ok = (await window.__pawos_ipc__.checkForUpdates()) === true;
      } catch {
        ok = false;
      }
      apply({ type: 'check-finished', ok });
      refresh();
    } else if (view.action === 'install') {
      window.__pawos_ipc__.quitAndInstall();
    }
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>PawOS version {version}</h3>
      {distribution && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            {view.message}
          </p>
          {distribution === 'store' && status !== 'available' && (
            <p className={styles.cardBody} style={{ marginTop: 4, opacity: 0.7 }}>
              Updates are delivered by the Microsoft Store.
            </p>
          )}
          <button
            type="button"
            className={styles.chip}
            style={{ marginTop: 10 }}
            disabled={view.action === null}
            onClick={onClick}
          >
            {view.buttonLabel}
          </button>
        </>
      )}
    </div>
  );
}
