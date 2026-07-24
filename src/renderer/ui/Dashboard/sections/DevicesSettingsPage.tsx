import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { deviceSessionsService } from '../../../sessions/DeviceSessionsService';
import { PairedDevicesPanel } from './PairedDevicesPanel';
import type { AuthUser } from '../../../auth/AuthTypes';
import type { DeviceSessionRecord, LocalDeviceIdentity } from '../../../../shared/device/DeviceTypes';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/** Supabase throws plain PostgrestError objects, not Error instances — extract `.message` generically so failures never render as "[object Object]". */
function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Devices tab: This Device, Active Sessions, QR Pairing, Sign out. */
export function DevicesSettingsPage({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [identity, setIdentity] = useState<LocalDeviceIdentity | null>(null);
  const [sessions, setSessions] = useState<DeviceSessionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ipc.deviceGetLocalIdentity().then(setIdentity).catch(() => {});
  }, []);

  useEffect(() => {
    if (user.isGuest || !identity) return;
    let cancelled = false;
    (async () => {
      try {
        const appVersion = await ipc.systemGetAppVersion();
        await deviceSessionsService.upsertThisDevice(identity, appVersion);
        const list = await deviceSessionsService.listMySessions();
        if (!cancelled) setSessions(list);
      } catch (e) {
        if (!cancelled) setError(getErrorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.isGuest, identity]);

  if (user.isGuest) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>No devices to manage on a guest session</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Device pairing and cross-device sessions are tied to a real account. Create a free
          account to pair your phone or see this account's other devices.
        </p>
      </div>
    );
  }

  const thisSession = sessions?.find((s) => s.deviceId === identity?.deviceId) ?? null;
  const otherSessions = sessions?.filter((s) => s.deviceId !== identity?.deviceId) ?? [];

  const signOutOthers = async () => {
    if (!identity) return;
    setBusy(true);
    setError(null);
    try {
      await deviceSessionsService.signOutOtherDevices(identity.deviceId);
      setSessions(await deviceSessionsService.listMySessions());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>This device</h3>
        <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
          <div>
            <p className={styles.cardBody}>Name</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{identity?.deviceName ?? '…'}</p>
          </div>
          <div>
            <p className={styles.cardBody}>Platform</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{identity?.platform ?? '…'}</p>
          </div>
          {thisSession && (
            <div>
              <p className={styles.cardBody}>Last seen</p>
              <p style={{ fontSize: 14, fontWeight: 600 }}>{formatDate(thisSession.lastSeenAt)}</p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Active sessions</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>
          Every other device currently signed into this account. Signing out uses a single bulk
          action under the hood (there's no way yet to revoke just one session individually) — it
          signs every device except this one out at once.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {otherSessions.length === 0 ? (
            <p className={styles.cardBody}>No other devices are signed in right now.</p>
          ) : (
            otherSessions.map((s) => (
              <div key={s.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div className={styles.cardBody} style={{ fontWeight: 600 }}>{s.deviceName}</div>
                  <div className={styles.cardBody} style={{ fontSize: 12 }}>{s.platform} · last seen {formatDate(s.lastSeenAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
        {otherSessions.length > 0 && (
          <button type="button" className={styles.dangerButton} style={{ marginTop: 12 }} disabled={busy} onClick={signOutOthers}>
            {busy ? 'Signing out…' : 'Sign out all other devices'}
          </button>
        )}
        {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
      </div>

      <div style={{ marginTop: 14 }}>
        <PairedDevicesPanel userId={user.id} />
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Sign out</h3>
        <p className={styles.cardBody} style={{ marginTop: 6 }}>Sign out of PawOS on this device.</p>
        <button type="button" className={styles.dangerButton} style={{ marginTop: 10 }} onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
