import React, { useCallback, useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import type { PairedDevice } from '../../../../shared/pairing/PairingTypes';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

/**
 * Generic platform device pairing UI — backed by
 * src/main/pairing/PlatformPairingStore.ts, independent of the frozen
 * Communication Runtime. No mobile client exists in this codebase yet to
 * actually scan the QR and complete a real handshake — this panel is
 * honest about that (it shows the real, working desktop half: a real QR
 * code, a real expiring token, and a real revocable device registry).
 */
export function PairedDevicesPanel({ userId }: { userId?: string }) {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [session, setSession] = useState<{ qrDataUrl: string; pairingUri: string; expiresAt: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    ipc.pairingList(userId).then(setDevices).catch(() => {});
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  const beginPairing = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await ipc.pairingBegin(userId);
      setSession({ qrDataUrl: result.qrDataUrl, pairingUri: result.pairingUri, expiresAt: result.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start pairing. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (deviceId: string) => {
    setBusy(true);
    try {
      await ipc.pairingRevoke(deviceId);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const activeDevices = devices.filter((d) => d.status === 'active');
  const revokedDevices = devices.filter((d) => d.status === 'revoked');

  return (
    <div>
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Pair a device</h3>
        <p className={styles.cardBody}>
          Scan this code from a PawOS mobile companion app to link it to your account. No mobile app exists
          yet in this build — this generates a real, working pairing code that a future companion app will
          be able to use to complete the handshake.
        </p>

        {session && secondsLeft > 0 ? (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
            <img
              src={session.qrDataUrl}
              alt="Pairing QR code"
              style={{ width: 160, height: 160, borderRadius: 8, background: '#fff', padding: 8 }}
            />
            <div>
              <p className={styles.cardBody}>Expires in {secondsLeft}s</p>
              <p className={styles.cardBody} style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                {session.pairingUri}
              </p>
              <button type="button" className={styles.primaryButton} onClick={beginPairing} disabled={busy}>
                Generate new code
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={beginPairing} disabled={busy}>
            {busy ? 'Generating…' : session ? 'Code expired — generate a new one' : 'Generate pairing code'}
          </button>
        )}

        {error && <p className={styles.cardBody} style={{ color: '#e57373', marginTop: 8 }}>{error}</p>}
      </div>

      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Paired devices</h3>
        {activeDevices.length === 0 ? (
          <p className={styles.cardBody}>No devices paired yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {activeDevices.map((d) => (
              <div key={d.deviceId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <div className={styles.cardBody} style={{ fontWeight: 600 }}>{d.name}</div>
                  <div className={styles.cardBody} style={{ fontSize: 12 }}>Paired {formatDate(d.pairedAt)}</div>
                </div>
                <button type="button" className={styles.dangerButton} onClick={() => revoke(d.deviceId)} disabled={busy}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
        {revokedDevices.length > 0 && (
          <p className={styles.cardBody} style={{ fontSize: 12, marginTop: 12, opacity: 0.7 }}>
            {revokedDevices.length} revoked device{revokedDevices.length === 1 ? '' : 's'} hidden from this list.
          </p>
        )}
      </div>
    </div>
  );
}
