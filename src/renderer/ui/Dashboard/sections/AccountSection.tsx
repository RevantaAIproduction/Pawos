import React from 'react';
import styles from '../dashboard.module.css';
import type { AuthUser } from '../../../auth/AuthTypes';

const PROVIDER_LABEL: Record<AuthUser['provider'], string> = {
  google: 'Google',
  email: 'Email',
  guest: 'Guest',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

export function AccountSection({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div>
      <div className={styles.card} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        {user.pictureUrl ? (
          <img
            src={user.pictureUrl}
            alt=""
            style={{ width: 56, height: 56, borderRadius: '999px', objectFit: 'cover' }}
          />
        ) : (
          <div
            className={styles.userAvatar}
            style={{ width: 56, height: 56, fontSize: 22, flexShrink: 0 }}
          >
            {initial}
          </div>
        )}
        <div>
          <h3 className={styles.cardTitle} style={{ marginBottom: 4 }}>
            {user.name}
          </h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className={styles.chip}>{PROVIDER_LABEL[user.provider]} account</span>
            {user.isGuest && <span className={styles.chip}>Guest Session</span>}
          </div>
          {user.email && <p className={styles.cardBody} style={{ marginTop: 6 }}>{user.email}</p>}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Subscription</h3>
          <p className={styles.cardBody}>Free (no paid plans exist yet).</p>
        </div>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Token Balance</h3>
          <p className={styles.cardBody}>0 — token purchases aren't implemented yet.</p>
        </div>
      </div>

      {user.isGuest && (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <p className={styles.cardBody}>
            You're on a Guest Session — no cloud sync, subscriptions, token purchases, backup, or
            cross-device sync. Go to <strong>Settings → Account</strong> to upgrade to a real
            account without losing your companion, memories, or settings.
          </p>
        </div>
      )}

      <button type="button" className={styles.dangerButton} style={{ marginTop: 20 }} onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
