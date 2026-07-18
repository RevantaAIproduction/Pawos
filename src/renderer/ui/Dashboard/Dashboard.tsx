import React, { useCallback, useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { Sidebar } from './Sidebar';
import { OverviewSection } from './sections/OverviewSection';
import { TalkSection } from './sections/TalkSection';
import { CompanionLabSection } from './sections/CompanionLabSection';
import { ConversationHistorySection } from './sections/ConversationHistorySection';
import { WorkHistorySection } from './sections/WorkHistorySection';
import { BrowserCapabilitiesSection } from './sections/BrowserCapabilitiesSection';
import { CommunicationDraftsSection } from './sections/CommunicationDraftsSection';
import { DesktopSection } from './sections/DesktopSection';
import { SettingsSection } from './sections/SettingsSection';
import { SECTION_TITLES, type SectionId } from './sections';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import type { AuthUser, EmailCreateAccountOptions } from '../../auth/AuthTypes';

export function Dashboard({
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
  const ipc = useIpcBridge();
  const [active, setActive] = useState<SectionId>('home');
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    ipc.isCompanionEnabled().then(setCompanionEnabled).catch(() => {});
  }, [ipc]);

  const handleEnable = useCallback(async () => {
    setPending(true);
    try {
      await ipc.enableCompanion();
      setCompanionEnabled(true);
    } finally {
      setPending(false);
    }
  }, [ipc]);

  const handleDisable = useCallback(async () => {
    setPending(true);
    try {
      await ipc.disableCompanion();
      setCompanionEnabled(false);
    } finally {
      setPending(false);
    }
  }, [ipc]);

  return (
    <div className={styles.shell}>
      <Sidebar active={active} onSelect={setActive} userName={user.name} companionEnabled={companionEnabled} />
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>{SECTION_TITLES[active]}</h1>
        </header>
        <div className={styles.content}>
          {active === 'home' && <OverviewSection onNavigate={setActive} />}
          {active === 'talk' && (
            <TalkSection enabled={companionEnabled} pending={pending} onEnable={handleEnable} onDisable={handleDisable} />
          )}
          {active === 'companionLab' && <CompanionLabSection />}
          {active === 'history' && <ConversationHistorySection />}
          {active === 'workHistory' && <WorkHistorySection />}
          {active === 'browserCapabilities' && <BrowserCapabilitiesSection />}
          {active === 'communicationDrafts' && <CommunicationDraftsSection />}
          {active === 'desktop' && <DesktopSection />}
          {active === 'settings' && (
            <SettingsSection
              user={user}
              onSignOut={onSignOut}
              onUpgradeGuestWithGoogle={onUpgradeGuestWithGoogle}
              onUpgradeGuestWithEmail={onUpgradeGuestWithEmail}
              isGoogleSignInAvailable={isGoogleSignInAvailable}
            />
          )}
        </div>
      </main>
    </div>
  );
}
