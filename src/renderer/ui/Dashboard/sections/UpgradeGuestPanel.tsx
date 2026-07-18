import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../../../auth/validation';
import type { EmailCreateAccountOptions } from '../../../auth/AuthTypes';

/**
 * The real "Upgrade Account" flow — Settings → Account → Upgrade Account.
 * No explicit data migration happens on upgrade: none of PawOS's local
 * stores are namespaced per-user yet, so the companion/memories/settings/
 * conversations/projects already sitting on this machine simply carry over
 * automatically once the session record changes (see AuthenticationProvider.ts).
 */
export function UpgradeGuestPanel({
  onUpgradeGuestWithGoogle,
  onUpgradeGuestWithEmail,
  isGoogleSignInAvailable,
}: {
  onUpgradeGuestWithGoogle: () => Promise<unknown>;
  onUpgradeGuestWithEmail: (options: EmailCreateAccountOptions) => Promise<unknown>;
  isGoogleSignInAvailable: () => Promise<boolean>;
}) {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(true);

  useEffect(() => {
    isGoogleSignInAvailable().then(setGoogleAvailable);
  }, [isGoogleSignInAvailable]);

  const handleGoogle = async () => {
    setError(null);
    setPending(true);
    try {
      await onUpgradeGuestWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter your name.');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (!isValidPassword(password)) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirmPassword) return setError('Passwords don’t match.');

    setError(null);
    setPending(true);
    try {
      await onUpgradeGuestWithEmail({ name, email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Upgrade Account</h3>
      <p className={styles.cardBody} style={{ marginBottom: 14 }}>
        Your companion, memories, settings, conversations, and projects all stay exactly as they
        are — this only replaces the guest session with a real account.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={styles.primaryButton} onClick={handleGoogle} disabled={pending}>
          Continue with Google
        </button>
        <button type="button" className={styles.chip} onClick={() => setShowEmailForm((v) => !v)} disabled={pending}>
          Create Email Account
        </button>
      </div>
      {!googleAvailable && (
        <p className={styles.cardBody} style={{ marginTop: 8, color: '#8b7bff' }}>
          Google sign-in needs a GOOGLE_CLIENT_ID configured in .env before this will work.
        </p>
      )}

      {showEmailForm && (
        <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {[
            { value: name, set: setName, placeholder: 'Name', type: 'text' },
            { value: email, set: setEmail, placeholder: 'Email', type: 'email' },
            { value: password, set: setPassword, placeholder: 'Password', type: 'password' },
            { value: confirmPassword, set: setConfirmPassword, placeholder: 'Confirm password', type: 'password' },
          ].map((field) => (
            <input
              key={field.placeholder}
              type={field.type}
              placeholder={field.placeholder}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.02)',
                color: '#f5f5f7',
                padding: '9px 12px',
                fontSize: 13,
              }}
            />
          ))}
          <button type="submit" className={styles.primaryButton} disabled={pending}>
            {pending ? 'Please wait…' : 'Create Account'}
          </button>
        </form>
      )}

      {error && (
        <p className={styles.cardBody} style={{ marginTop: 10, color: '#ff9a9a' }}>
          {error}
        </p>
      )}
    </div>
  );
}
