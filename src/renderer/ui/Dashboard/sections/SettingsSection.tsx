import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import {
  AccountIcon,
  DesktopIcon,
  SettingsIcon,
  AIIcon,
  ShieldIcon,
  SecurityIcon,
  BrowserToolsIcon,
  CardIcon,
  TerminalIcon,
} from '../NavIcons';
import { AccountSettingsPage } from './AccountSettingsPage';
import { DevicesSettingsPage } from './DevicesSettingsPage';
import { PreferencesSettingsPage } from './PreferencesSettingsPage';
import { AISettingsPage } from './AISettingsPage';
import { PrivacySection } from './PrivacySection';
import { SecuritySettingsPage } from './SecuritySettingsPage';
import { BrowserToolsSettingsPage } from './BrowserToolsSettingsPage';
import { BillingSettingsPage } from './BillingSettingsPage';
import { DevelopersSettingsPage } from './DevelopersSettingsPage';
import type { AuthUser, EmailCreateAccountOptions } from '../../../auth/AuthTypes';

const SETTINGS_TABS = [
  'Account',
  'Devices',
  'Preferences',
  'AI',
  'Privacy',
  'Security',
  'Browser Tools',
  'Billing',
  'Developers',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

const CATEGORY_ICONS: Record<SettingsTab, React.ComponentType> = {
  Account: AccountIcon,
  Devices: DesktopIcon,
  Preferences: SettingsIcon,
  AI: AIIcon,
  Privacy: ShieldIcon,
  Security: SecurityIcon,
  'Browser Tools': BrowserToolsIcon,
  Billing: CardIcon,
  Developers: TerminalIcon,
};

export function SettingsSection({
  user,
  onSignOut,
  onUpgradeGuestWithGoogle,
  onUpgradeGuestWithEmail,
  isGoogleSignInAvailable,
  initialTab,
  onUpgrade,
  onOpenCompanionStudio,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onUpgradeGuestWithGoogle: () => Promise<unknown>;
  onUpgradeGuestWithEmail: (options: EmailCreateAccountOptions) => Promise<unknown>;
  isGoogleSignInAvailable: () => Promise<boolean>;
  /** Set when arriving from the profile menu's shortcuts — otherwise defaults to Account. */
  initialTab?: SettingsTab;
  /** Navigates to the dedicated plan-comparison page — not a Settings tab itself. */
  onUpgrade: () => void;
  onOpenCompanionStudio: () => void;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'Account');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const goToAccount = () => setTab('Account');
  const goToDevices = () => setTab('Devices');

  return (
    <div className={styles.settingsLayout}>
      <nav className={styles.settingsNav}>
        {SETTINGS_TABS.map((c) => {
          const Icon = CATEGORY_ICONS[c];
          return (
            <button
              key={c}
              type="button"
              className={`${styles.settingsNavItem} ${tab === c ? styles.settingsNavItemActive : ''}`}
              onClick={() => setTab(c)}
            >
              <span className={styles.settingsNavIcon}>
                <Icon />
              </span>
              {c}
            </button>
          );
        })}
      </nav>

      <div className={styles.settingsContent}>
        {tab === 'Account' && (
          <AccountSettingsPage
            user={user}
            onSignOut={onSignOut}
            onUpgradeGuestWithGoogle={onUpgradeGuestWithGoogle}
            onUpgradeGuestWithEmail={onUpgradeGuestWithEmail}
            isGoogleSignInAvailable={isGoogleSignInAvailable}
            onRequestPasswordReset={onRequestPasswordReset}
            onVerifyPasswordResetCode={onVerifyPasswordResetCode}
            onCompletePasswordReset={onCompletePasswordReset}
          />
        )}
        {tab === 'Devices' && <DevicesSettingsPage user={user} onSignOut={onSignOut} />}
        {tab === 'Preferences' && <PreferencesSettingsPage onOpenCompanionStudio={onOpenCompanionStudio} />}
        {tab === 'AI' && <AISettingsPage />}
        {tab === 'Privacy' && <PrivacySection />}
        {tab === 'Security' && <SecuritySettingsPage onGoToAccount={goToAccount} onGoToDevices={goToDevices} />}
        {tab === 'Browser Tools' && <BrowserToolsSettingsPage />}
        {tab === 'Billing' && <BillingSettingsPage user={user} onGoToAccount={goToAccount} onUpgrade={onUpgrade} />}
        {tab === 'Developers' && <DevelopersSettingsPage />}
      </div>
    </div>
  );
}
