import React, { useState } from 'react';
import styles from '../dashboard.module.css';
import { SkinManagerPanel } from './SkinManagerPanel';
import { UpgradeGuestPanel } from './UpgradeGuestPanel';
import { AccountSection } from './AccountSection';
import { MailPreviewSection } from './MailPreviewSection';
import type { AuthUser, EmailCreateAccountOptions } from '../../../auth/AuthTypes';

const TABS = ['Appearance', 'Account', 'Mail Preview'] as const;

type Tab = (typeof TABS)[number];

export function SettingsSection({
  user,
  onSignOut,
  onUpgradeGuestWithGoogle,
  onUpgradeGuestWithEmail,
  isGoogleSignInAvailable,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onUpgradeGuestWithGoogle: () => Promise<unknown>;
  onUpgradeGuestWithEmail: (options: EmailCreateAccountOptions) => Promise<unknown>;
  isGoogleSignInAvailable: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<Tab>('Appearance');

  return (
    <div>
      <div className={styles.tabRow} style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tabButton} ${tab === t ? styles.tabButtonActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Appearance' && <SkinManagerPanel />}
      {tab === 'Account' && (
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
        </div>
      )}
      {tab === 'Mail Preview' && <MailPreviewSection />}
    </div>
  );
}
