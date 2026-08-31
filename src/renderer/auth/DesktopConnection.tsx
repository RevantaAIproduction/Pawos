import React, { useState, useEffect } from 'react';
import styles from './desktopConnection.module.css';

interface DesktopConnectionProps {
  userEmail: string;
  onConnected?: () => void;
  onError?: (error: string) => void;
}

type PairingMode = 'waiting' | 'qr-scan' | 'code-entry' | 'paired';

interface PairingInfo {
  qrCode: string; // QR code as SVG or image
  secureCode: string; // 6-8 digit code
  expiresAt: number;
  desktopInfo: {
    name: string;
    tier: 'go' | 'pro' | 'pro_max' | 'team' | 'enterprise';
  };
}

export function DesktopConnection({ userEmail, onConnected, onError }: DesktopConnectionProps) {
  const [pairingMode, setPairingMode] = useState<PairingMode>('waiting');
  const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Request pairing info from desktop via IPC or API
    const requestPairingInfo = async () => {
      try {
        const response = await fetch('/api/pairing/request', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          },
          body: JSON.stringify({ userEmail }),
        });

        if (!response.ok) throw new Error('Desktop not available');

        const data = await response.json();
        setPairingInfo(data);
        setPairingMode('qr-scan');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Cannot reach desktop');
        setPairingMode('code-entry'); // Fallback to code entry
      }
    };

    requestPairingInfo();
    const interval = setInterval(requestPairingInfo, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [userEmail]);

  const handleCodeSubmit = async () => {
    if (!enteredCode.trim()) return;

    try {
      setError('');
      const response = await fetch('/api/pairing/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify({
          userEmail,
          code: enteredCode.toUpperCase(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Invalid code');
      }

      const data = await response.json();
      localStorage.setItem('pairing_token', data.pairingToken);
      localStorage.setItem('paired_desktop', JSON.stringify(data.desktop));

      setPairingMode('paired');
      onConnected?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Pairing failed';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.title}>Pair with Desktop</h2>
          <p className={styles.subtitle}>Complete setup to sync mobile with PawOS Desktop</p>
          {pairingInfo?.desktopInfo && (
            <p className={styles.desktopInfo}>
              Desktop: <strong>{pairingInfo.desktopInfo.name}</strong> • <strong>{pairingInfo.desktopInfo.tier.toUpperCase()}</strong>
            </p>
          )}
        </div>

        <div className={styles.content}>
          {pairingMode === 'waiting' ? (
            <div className={styles.waiting}>
              <div className={styles.spinner} />
              <p className={styles.statusText}>Requesting pairing info from desktop...</p>
              <p className={styles.hint}>Make sure PawOS Desktop is running</p>
            </div>
          ) : null}

          {pairingMode === 'qr-scan' && pairingInfo ? (
            <div className={styles.qrSection}>
              <div className={styles.qrContainer}>
                <div className={styles.qrPlaceholder} dangerouslySetInnerHTML={{ __html: pairingInfo.qrCode }} />
              </div>
              <p className={styles.qrInstructions}>Scan with your desktop camera or enter code below</p>

              <div className={styles.divider}>
                <span>or</span>
              </div>

              <div className={styles.codeEntry}>
                <label className={styles.label}>Secure Pairing Code</label>
                <input
                  type="text"
                  className={styles.codeInput}
                  placeholder="Enter code from desktop"
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoFocus
                />
                <button
                  className={styles.submitBtn}
                  onClick={handleCodeSubmit}
                  disabled={!enteredCode.trim()}
                >
                  Complete Pairing
                </button>
              </div>
            </div>
          ) : null}

          {pairingMode === 'code-entry' && !pairingInfo ? (
            <div className={styles.codeOnly}>
              <div className={styles.codeIcon}>🔐</div>
              <p className={styles.statusText}>Enter Pairing Code from Desktop</p>

              <div className={styles.codeEntry}>
                <input
                  type="text"
                  className={styles.codeInput}
                  placeholder="Enter code from desktop"
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                  maxLength={8}
                  autoFocus
                />
                <button
                  className={styles.submitBtn}
                  onClick={handleCodeSubmit}
                  disabled={!enteredCode.trim()}
                >
                  Complete Pairing
                </button>
              </div>
            </div>
          ) : null}

          {pairingMode === 'paired' ? (
            <div className={styles.success}>
              <div className={styles.checkmark}>✓</div>
              <p className={styles.successText}>Connected!</p>
              <p className={styles.successSubtext}>Mobile synced with PawOS Desktop</p>
            </div>
          ) : null}

          {error && (
            <div className={styles.errorBox}>
              <p className={styles.errorText}>{error}</p>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.footerText}>🔒 Secure pairing with encrypted connection</p>
        </div>
      </div>
    </div>
  );
}
