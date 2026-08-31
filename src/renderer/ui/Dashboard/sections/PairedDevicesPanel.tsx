import React, { useCallback, useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { trustedDeviceService } from '../../../mobilePresence/TrustedDeviceService';
import { pairingService } from '../../../mobilePresence/PairingService';
import { CrossDevicePresenceSession } from '../../../mobilePresence/CrossDevicePresenceSession';
import { ConnectMobileUI } from './ConnectMobileUI';
import type { TrustedDevice, PairingSessionStart, DevicePresenceMember } from '../../../../shared/mobilePresence/MobilePresenceTypes';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function capabilityBadges(device: TrustedDevice): string[] {
  const labels: string[] = [];
  if (device.capabilities.pushNotifications) labels.push('Push');
  if (device.capabilities.voice) labels.push('Voice');
  if (device.capabilities.camera) labels.push('Camera');
  if (device.capabilities.microphone) labels.push('Microphone');
  if (device.capabilities.biometrics) labels.push('Biometrics');
  if (device.capabilities.offlineSupport) labels.push('Offline');
  if (device.capabilities.backgroundSync) labels.push('Background sync');
  return labels;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Mobile Presence — Trusted Device Runtime + Pairing Runtime UI (MOB-5).
 * Replaces the old PlatformPairingStore-backed panel entirely: pairing now
 * runs through real Supabase RPCs (begin_pairing_session/complete_pairing_session),
 * is enforced server-side by tier (see the pairing-enforcement migration),
 * and the phone side is the real pawos-web PWA at /pair/[sessionId] — not a
 * "no mobile app exists yet" placeholder.
 */
export function PairedDevicesPanel({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [canPair, setCanPair] = useState<boolean | null>(null);
  const [session, setSession] = useState<PairingSessionStart | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paired, setPaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineDeviceIds, setOnlineDeviceIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    trustedDeviceService.list().then(setDevices).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    ipc.entitlementIsFeatureAvailable('mobilePairing').then(setCanPair).catch(() => setCanPair(false));
  }, [refresh]);

  // Cross Device Runtime (MOB-6): the desktop tracks its own presence too (not just a
  // one-way phone-into-desktop feed) — this is what will let a future phone-side view show
  // "desktop online" live, and it's also how this panel learns which trusted phones are
  // currently connected without polling.
  useEffect(() => {
    const session = new CrossDevicePresenceSession();
    let cancelled = false;
    ipc.deviceGetLocalIdentity().then((identity) => {
      if (cancelled) return;
      session.join(userId, { deviceId: identity.deviceId, deviceType: 'desktop', deviceName: identity.deviceName }, (members: DevicePresenceMember[]) => {
        setOnlineDeviceIds(new Set(members.map((m) => m.deviceId)));
      });
    });
    return () => {
      cancelled = true;
      session.leave();
    };
  }, [userId]);

  useEffect(() => {
    if (!session) return;
    const expiresAtMs = new Date(session.expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const unsubscribe = pairingService.subscribeToPairingCompletion(session.sessionId, userId, () => {
      setPaired(true);
      setSession(null);
      refresh();
    });
    return unsubscribe;
  }, [session, userId, refresh]);

  const beginPairing = async () => {
    setError(null);
    setPaired(false);
    setBusy(true);
    try {
      await pairingService.syncEntitlementTier();
      const result = await pairingService.beginPairing();
      setSession(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelPairing = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await pairingService.cancelPairing(session.sessionId);
      setSession(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (deviceId: string) => {
    setBusy(true);
    try {
      await trustedDeviceService.revoke(deviceId);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const activeDevices = devices.filter((d) => d.status === 'active');
  const revokedDevices = devices.filter((d) => d.status === 'revoked');

  return (
    <div>
      {/* Connect Mobile — New web auth + Security Key flow */}
      <ConnectMobileUI userId={userId} onSuccess={() => refresh()} />

      {/* Legacy Pair Device — existing QR-based pairing */}
      <div className={styles.card} style={{ marginTop: 14 }}>
        <h3 className={styles.cardTitle}>Pair a device (legacy)</h3>
        <p className={styles.cardBody}>
          Scan this code with your phone's camera to open the PawOS web app and link it as a trusted
          device — notifications, approvals, and a live preview of your conversation follow from there.
        </p>

        {canPair === false && (
          <p className={styles.cardBody} style={{ marginTop: 10, opacity: 0.85 }}>
            Mobile pairing is a Pro feature. Upgrade your plan from Settings → Billing to pair a
            phone to this account.
          </p>
        )}

        {canPair === true && (
          <>
            {paired && !session && (
              <p className={styles.cardBody} style={{ color: '#7fd9a0', marginTop: 8 }}>
                Device paired successfully.
              </p>
            )}

            {session && secondsLeft > 0 ? (
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
                <img
                  src={session.qrDataUrl}
                  alt="Pairing QR code"
                  style={{ width: 160, height: 160, borderRadius: 8, background: '#fff', padding: 8 }}
                />
                <div>
                  <p className={styles.cardBody}>Expires in {secondsLeft}s — waiting for your phone to complete pairing…</p>
                  <p className={styles.cardBody} style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>
                    {session.pairingUrl}
                  </p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button type="button" className={styles.dangerButton} onClick={cancelPairing} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} onClick={beginPairing} disabled={busy}>
                {busy ? 'Generating…' : session ? 'Code expired — generate a new one' : 'Pair Device'}
              </button>
            )}
          </>
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
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div>
                  <div className={styles.cardBody} style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {d.name}
                    {onlineDeviceIds.has(d.id) && (
                      <span style={{ color: '#7fd9a0', fontSize: 11, fontWeight: 400 }}>● Online now</span>
                    )}
                  </div>
                  <div className={styles.cardBody} style={{ fontSize: 12 }}>
                    {[d.deviceType, d.platform, d.browser].filter(Boolean).join(' · ')}
                  </div>
                  <div className={styles.cardBody} style={{ fontSize: 12 }}>
                    Paired {formatDate(d.pairedAt)} · Last seen {formatDate(d.lastSeenAt)}
                  </div>
                  {capabilityBadges(d).length > 0 && (
                    <div className={styles.cardBody} style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                      {capabilityBadges(d).join(' · ')}
                    </div>
                  )}
                </div>
                <button type="button" className={styles.dangerButton} onClick={() => revoke(d.id)} disabled={busy}>
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
