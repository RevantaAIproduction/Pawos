import React from 'react';
import styles from '../dashboard.module.css';
import type { AuthUser } from '../../../auth/AuthTypes';

const PROVIDER_LABEL: Record<AuthUser['provider'], string> = {
  google: 'Google',
  email: 'Email',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

/** Profile + sign-out only — plan, models, credits, and billing live in the Subscription tab (SubscriptionSection.tsx). */
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
          </div>
          {user.email && <p className={styles.cardBody} style={{ marginTop: 6 }}>{user.email}</p>}
        </div>
      </div>

      <button type="button" className={styles.dangerButton} style={{ marginTop: 20 }} onClick={onSignOut}>
        Sign Out
      </button>
    </div>
  );
}
