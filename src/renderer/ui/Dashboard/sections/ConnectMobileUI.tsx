/**
 * Connect Mobile UI — Desktop workflow for pairing a mobile device
 * Integrated into PairedDevicesPanel.
 *
 * States:
 * 1. 'initial' — Show "Connect Mobile" button
 * 2. 'auth' — Web authorization in progress
 * 3. 'qr' — Display QR code with countdown
 * 4. 'key' — Display Security Key, waiting for mobile entry
 * 5. 'verification' — Verifying mobile's key submission
 * 6. 'success' — Device paired
 * 7. 'error' — Error state with recovery option
 */

import React, { useState, useEffect } from 'react';
import styles from '../dashboard.module.css';
import { ipc } from '../../../services/ipc/ipcBridgeImplementation';
import { pairingService } from '../../../mobilePresence/PairingService';
import type { SecurityKeyChallenge } from '../../../../shared/mobilePresence/MobileAuthTypes';

type ConnectMobileState =
  | 'initial'
  | 'auth'
  | 'qr'
  | 'key'
  | 'verification'
  | 'success'
  | 'error';

interface ConnectMobileUIProps {
  userId: string;
  onSuccess?: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function ConnectMobileUI({ userId, onSuccess }: ConnectMobileUIProps) {
  const [state, setState] = useState<ConnectMobileState>('initial');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [securityKey, setSecurityKey] = useState<SecurityKeyChallenge | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Step 1: Start web authorization flow
   */
  const startAuthorization = async () => {
    setError(null);
    setBusy(true);

    try {
      // Call PairingService to create pairing session
      const session = await pairingService.beginPairing();
      setSessionId(session.sessionId);
      setQrDataUrl(session.qrDataUrl);

      // Get web authorization URL from main process
      const authUrl = await ipc.mobileAuth__getWebAuthorizationUrl(session.sessionId);

      // Open web authorization in new window
      // (In production: open BrowserWindow to authUrl, wait for redirect)
      // For now, we'll simulate: just proceed to QR step
      setState('qr');
    } catch (err) {
      setError(getErrorMessage(err));
      setState('error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Step 2: Wait for mobile to scan QR
   * Subscribe to completion via Cross Device Runtime
   */
  useEffect(() => {
    if (!sessionId || state !== 'qr') return;

    let cancelled = false;
    const unsubscribe = pairingService.subscribeToPairingCompletion(
      sessionId,
      userId,
      async () => {
        if (cancelled) return;

        // Mobile scanned QR successfully
        // Generate Security Key
        try {
          const keyChallenge = await ipc.mobileAuth__generateSecurityKey(sessionId);
          setSecurityKey(keyChallenge);
          setState('key');
        } catch (err) {
          setError(getErrorMessage(err));
          setState('error');
        }
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId, state, userId]);

  /**
   * Step 3: Countdown timer for QR
   */
  useEffect(() => {
    if (!qrDataUrl || state !== 'qr') return;

    // For now, use a simple countdown (in production, get from session.expiresAt)
    const expiresIn = 5 * 60; // 5 minutes
    let secondsLeftRef = expiresIn;

    const tick = () => {
      setSecondsLeft(Math.max(0, secondsLeftRef));
      secondsLeftRef--;
    };

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, [qrDataUrl, state]);

  /**
   * Step 4: Countdown timer for Security Key
   */
  useEffect(() => {
    if (!securityKey || state !== 'key') return;

    const expiresAtMs = new Date(securityKey.expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000)));

    tick();
    const timer = window.setInterval(tick, 1000);

    return () => window.clearInterval(timer);
  }, [securityKey, state]);

  /**
   * Step 5: Cancel QR or Key (for any reason)
   */
  const cancel = async () => {
    if (!sessionId) return;

    setBusy(true);
    try {
      await pairingService.cancelPairing(sessionId);
      setState('initial');
      setSessionId(null);
      setQrDataUrl(null);
      setSecurityKey(null);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * UI: Initial state — "Connect Mobile" button
   */
  if (state === 'initial') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Connect Mobile</h3>
        <p className={styles.cardBody}>
          Pair your mobile device to this PawOS account. Your phone will receive real-time updates,
          task completions, and can approve actions remotely.
        </p>
        <button
          type="button"
          className={styles.primaryButton}
          style={{ marginTop: 10 }}
          onClick={startAuthorization}
          disabled={busy}
        >
          {busy ? 'Starting...' : 'Connect Mobile'}
        </button>
        {error && <p className={styles.cardBody} style={{ color: '#e57373', marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  /**
   * UI: Authorization in progress
   */
  if (state === 'auth') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Authorize PawOS Mobile</h3>
        <p className={styles.cardBody}>
          A browser window has opened. Please authorize PawOS Mobile access to your account.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button type="button" className={styles.dangerButton} onClick={cancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /**
   * UI: QR code display
   */
  if (state === 'qr' && qrDataUrl) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Scan QR Code</h3>
        <p className={styles.cardBody}>
          Open PawOS on your mobile device and scan this QR code to begin pairing.
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginTop: 12, flexWrap: 'wrap' }}>
          <img
            src={qrDataUrl}
            alt="Pairing QR code"
            style={{ width: 160, height: 160, borderRadius: 8, background: '#fff', padding: 8 }}
          />
          <div>
            <p className={styles.cardBody} style={{ fontWeight: 600 }}>
              Waiting for mobile...
            </p>
            <p className={styles.cardBody}>Expires in {secondsLeft}s</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button type="button" className={styles.dangerButton} onClick={cancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * UI: Security Key display
   */
  if (state === 'key' && securityKey) {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Security Key</h3>
        <p className={styles.cardBody}>
          A green checkmark appeared on your mobile device. Now enter this key to complete pairing.
        </p>

        <div
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            marginTop: 12,
            textAlign: 'center',
          }}
        >
          <p className={styles.cardBody} style={{ fontSize: 12, opacity: 0.7, margin: '0 0 4px 0' }}>
            SECURITY KEY
          </p>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: 'monospace',
              letterSpacing: 2,
              margin: 8,
              color: '#222',
            }}
          >
            {securityKey.plaintext}
          </div>
          <p className={styles.cardBody} style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 0 0' }}>
            Expires in {secondsLeft}s
          </p>
        </div>

        <p className={styles.cardBody} style={{ marginTop: 12 }}>
          Enter this key on your mobile device. Do not share this key with anyone.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button type="button" className={styles.dangerButton} onClick={cancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /**
   * UI: Verification in progress
   */
  if (state === 'verification') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Verifying Connection</h3>
        <p className={styles.cardBody}>
          Verifying your security key...
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <div
            style={{
              borderRadius: '50%',
              border: '3px solid #eee',
              borderTop: '3px solid #666',
              width: 40,
              height: 40,
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </div>
    );
  }

  /**
   * UI: Success
   */
  if (state === 'success') {
    return (
      <div className={styles.card}>
        <div style={{ textAlign: 'center', paddingTop: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h3 className={styles.cardTitle}>Mobile Connected</h3>
          <p className={styles.cardBody}>
            Your mobile device is now paired to this PawOS account.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            style={{ marginTop: 10 }}
            onClick={() => {
              setState('initial');
              setSessionId(null);
              setQrDataUrl(null);
              setSecurityKey(null);
              onSuccess?.();
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  /**
   * UI: Error state
   */
  if (state === 'error') {
    return (
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Connection Failed</h3>
        <p className={styles.cardBody} style={{ color: '#e57373' }}>
          {error || 'An error occurred during pairing.'}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setState('initial');
              setSessionId(null);
              setQrDataUrl(null);
              setSecurityKey(null);
              setError(null);
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
