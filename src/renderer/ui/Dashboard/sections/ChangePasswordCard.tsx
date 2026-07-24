import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { OtpInput } from '../../Auth/OtpInput';
import { isValidPassword, MIN_PASSWORD_LENGTH } from '../../../auth/validation';

type Step = 'idle' | 'code' | 'newPassword' | 'done';

/**
 * Real password change for signed-in email accounts — reuses the exact same
 * OTP + signed-reset-token flow as AuthScreen.tsx's pre-login "Forgot
 * password?", just with the email pre-filled/locked to the current user
 * (EmailAuthProvider.resetPassword() only requires the current session's
 * email to match, which is always true here).
 */
export function ChangePasswordCard({
  email,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
}: {
  email: string;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const [step, setStep] = useState<Step>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const startChange = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await onRequestPasswordReset(email);
      setExpiresInMinutes(result.expiresInMinutes);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await onVerifyPasswordResetCode(email, code);
      if (!result.valid || !result.resetToken) {
        setError(result.reason ?? 'Incorrect code.');
        return;
      }
      setResetToken(result.resetToken);
      setNewPassword('');
      setConfirmNewPassword('');
      setStep('newPassword');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async () => {
    if (!isValidPassword(newPassword)) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords don’t match.');
      return;
    }
    if (!resetToken) {
      setError('Your session expired — start over.');
      setStep('idle');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await onCompletePasswordReset(resetToken, newPassword);
      if (!result.ok) {
        setError(result.reason ?? 'Could not change your password. Please try again.');
        return;
      }
      setStep('done');
      setResetToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Password</h3>

      {step === 'idle' && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            We'll send a 6-digit code to {email} to confirm it's you.
          </p>
          <button type="button" className={styles.primaryButton} style={{ marginTop: 10 }} disabled={busy} onClick={startChange}>
            {busy ? 'Sending…' : 'Change password'}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>
            Enter the code we sent to {email}
            {expiresInMinutes ? ` — it expires in ${expiresInMinutes} minutes.` : '.'}
          </p>
          <div style={{ marginTop: 10 }}>
            <OtpInput value={code} onChange={setCode} disabled={busy} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className={styles.primaryButton} disabled={busy} onClick={verifyCode}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => setStep('idle')}>
              Cancel
            </button>
          </div>
        </>
      )}

      {step === 'newPassword' && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>Choose your new password.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, maxWidth: 320 }}>
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e8e8ec', padding: '8px 10px', fontSize: 13 }}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              autoComplete="new-password"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#e8e8ec', padding: '8px 10px', fontSize: 13 }}
            />
          </div>
          <button type="button" className={styles.primaryButton} style={{ marginTop: 12 }} disabled={busy} onClick={setPassword}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </>
      )}

      {step === 'done' && (
        <>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>Your password has been changed.</p>
          <button type="button" className={styles.chip} style={{ marginTop: 10 }} onClick={() => setStep('idle')}>
            Change it again
          </button>
        </>
      )}

      {error && <p style={{ color: '#e08c8c', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
    </div>
  );
}
