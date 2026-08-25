import React, { useEffect, useState } from 'react';
import styles from '../dashboard.module.css';
import { ChevronRightIcon } from '../NavIcons';
import { SettingsHome } from '../SettingsHome';
import { SettingsPageHeader } from '../SettingsPageHeader';
import { AccountSettingsPage } from './AccountSettingsPage';
import { DevicesSettingsPage } from './DevicesSettingsPage';
import { PreferencesSettingsPage } from './PreferencesSettingsPage';
import { AISettingsPage } from './AISettingsPage';
import { PrivacySection } from './PrivacySection';
import { SecuritySettingsPage } from './SecuritySettingsPage';
import { BrowserToolsSettingsPage } from './BrowserToolsSettingsPage';
import { BillingSettingsPage } from './BillingSettingsPage';
import { DevelopersSettingsPage } from './DevelopersSettingsPage';
import { ConnectionsPage } from './ConnectionsPage';
import { useConnectivityBootstrap } from '../../../connectivity/useConnectivityBootstrap';
import type { AuthUser } from '../../../auth/AuthTypes';

const SETTINGS_TABS = [
  'Home',
  'Account',
  'Devices',
  'Preferences',
  'AI',
  'Privacy',
  'Security',
  'Browser Tools',
  'Connections',
  'Billing',
  'Developers',
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function SettingsSection({
  user,
  onSignOut,
  initialTab,
  onUpgrade,
  onOpenCompanionStudio,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
  onOpenSupportMessages,
}: {
  user: AuthUser;
  onSignOut: () => void;
  /** Set when arriving from the profile menu's shortcuts — otherwise defaults to Account. */
  initialTab?: SettingsTab;
  /** Navigates to the dedicated plan-comparison page — not a Settings tab itself. */
  onUpgrade: () => void;
  onOpenCompanionStudio: () => void;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Opens the floating Support widget directly on its Messages tab — used by Organization seat-change requests. */
  onOpenSupportMessages: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'Home');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  // Restores every persisted connector credential once per session (never on repeated visits) —
  // see useConnectivityBootstrap's own doc comment. Deliberately not inside ConnectionsPage.tsx,
  // which is pure status discovery and must never itself trigger authentication.
  useConnectivityBootstrap({ userId: user.id });

  const goToAccount = () => setTab('Account');
  const goToDevices = () => setTab('Devices');

  return (
    <div>
      {tab !== 'Home' && (
        <button type="button" className={styles.sectionBackButton} onClick={() => setTab('Home')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}>
            <ChevronRightIcon />
          </span>
          Settings
        </button>
      )}

      <div className={`${styles.settingsContent} ${styles.pageFadeIn}`} key={tab}>
        {tab === 'Home' && (
          <SettingsHome user={user} onSelectTab={setTab} onOpenCompanionStudio={onOpenCompanionStudio} />
        )}
        {tab === 'Account' && (
          <>
            <SettingsPageHeader title="Account" description="Profile, email, password, and your organization." />
            <AccountSettingsPage
              user={user}
              onSignOut={onSignOut}
              onRequestPasswordReset={onRequestPasswordReset}
              onVerifyPasswordResetCode={onVerifyPasswordResetCode}
              onCompletePasswordReset={onCompletePasswordReset}
              onOpenSupportMessages={onOpenSupportMessages}
            />
          </>
        )}
        {tab === 'Devices' && (
          <>
            <SettingsPageHeader title="Devices" description="This device, active sessions, and paired phones." />
            <DevicesSettingsPage user={user} onSignOut={onSignOut} />
          </>
        )}
        {tab === 'Preferences' && (
          <>
            <SettingsPageHeader title="Preferences" description="General (including theme and language), appearance, voice, and notifications." />
            <PreferencesSettingsPage onOpenCompanionStudio={onOpenCompanionStudio} />
          </>
        )}
        {tab === 'AI' && (
          <>
            <SettingsPageHeader title="AI" description="Which Paw model you're using, and what your plan unlocks." />
            <AISettingsPage onUpgrade={onUpgrade} />
          </>
        )}
        {tab === 'Privacy' && (
          <>
            <SettingsPageHeader title="Privacy" description="What PawOS stores, and your recording consent." />
            <PrivacySection />
          </>
        )}
        {tab === 'Security' && (
          <>
            <SettingsPageHeader title="Security" description="Password, sessions, and account protection." />
            <SecuritySettingsPage onGoToAccount={goToAccount} onGoToDevices={goToDevices} />
          </>
        )}
        {tab === 'Browser Tools' && (
          <>
            <SettingsPageHeader title="Browser Tools" description="Browser automation preferences." />
            <BrowserToolsSettingsPage />
          </>
        )}
        {tab === 'Connections' && <ConnectionsPage scope={{ userId: user.id }} onUpgrade={onUpgrade} />}
        {tab === 'Billing' && (
          <>
            <SettingsPageHeader title="Billing" description="Plan, credits, and usage." />
            <BillingSettingsPage user={user} onGoToAccount={goToAccount} onUpgrade={onUpgrade} />
          </>
        )}
        {tab === 'Developers' && (
          <>
            <SettingsPageHeader title="Developers" description="Coding mode, infrastructure connectors, and updates." />
            <DevelopersSettingsPage />
          </>
        )}
      </div>
    </div>
  );
}
