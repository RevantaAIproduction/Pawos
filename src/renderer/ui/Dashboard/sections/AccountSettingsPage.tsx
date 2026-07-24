import React from 'react';
import styles from '../dashboard.module.css';
import { AccountSection } from './AccountSection';
import { UpgradeGuestPanel } from './UpgradeGuestPanel';
import { ChangePasswordCard } from './ChangePasswordCard';
import { OrganizationSection } from './OrganizationSection';
import type { AuthUser, EmailCreateAccountOptions } from '../../../auth/AuthTypes';

function formatMemberSince(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Account tab: Profile, Email, Password, and Organization stacked as cards — the same one-page-many-cards pattern OrganizationSection.tsx already used as its own top-level tab. */
export function AccountSettingsPage({
  user,
  onSignOut,
  onUpgradeGuestWithGoogle,
  onUpgradeGuestWithEmail,
  isGoogleSignInAvailable,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onUpgradeGuestWithGoogle: () => Promise<unknown>;
  onUpgradeGuestWithEmail: (options: EmailCreateAccountOptions) => Promise<unknown>;
  isGoogleSignInAvailable: () => Promise<boolean>;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  return (
    <div>
      <AccountSection user={user} onSignOut={onSignOut} />

      {user.isGuest && (
        <div style={{ marginTop: 14 }}>
          <UpgradeGuestPanel
            onUpgradeGuestWithGoogle={onUpgradeGuestWithGoogle}
            onUpgradeGuestWithEmail={onUpgradeGuestWithEmail}
            isGoogleSignInAvailable={isGoogleSignInAvailable}
          />
        </div>
      )}

      {!user.isGuest && (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <h3 className={styles.cardTitle}>Profile</h3>
          <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
            <div>
              <p className={styles.cardBody}>Account ID</p>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>{user.id}</p>
            </div>
            <div>
              <p className={styles.cardBody}>Member since</p>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{formatMemberSince(user.createdAt)}</p>
            </div>
          </div>
        </div>
      )}

      {!user.isGuest && user.email && (
        <div className={styles.card} style={{ marginTop: 14 }}>
          <h3 className={styles.cardTitle}>Email</h3>
          <p className={styles.cardBody} style={{ marginTop: 6 }}>{user.email}</p>
          <p className={styles.cardBody} style={{ marginTop: 6, opacity: 0.7 }}>
            Changing your email address is coming in a future update.
          </p>
        </div>
      )}

      {!user.isGuest && user.provider === 'email' && (
        <div style={{ marginTop: 14 }}>
          <ChangePasswordCard
            email={user.email ?? ''}
            onRequestPasswordReset={onRequestPasswordReset}
            onVerifyPasswordResetCode={onVerifyPasswordResetCode}
            onCompletePasswordReset={onCompletePasswordReset}
          />
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <OrganizationSection user={user} />
      </div>
    </div>
  );
}
