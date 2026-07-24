import React, { useCallback, useEffect, useState } from 'react';
import styles from './dashboard.module.css';
import { Sidebar } from './Sidebar';
import type { ProfileMenuAction } from './ProfileMenu';
import { OverviewSection } from './sections/OverviewSection';
import { TalkSection } from './sections/TalkSection';
import { CompanionLabSection } from './sections/CompanionLabSection';
import { ConversationHistorySection } from './sections/ConversationHistorySection';
import { WorkHistorySection } from './sections/WorkHistorySection';
import { BrowserCapabilitiesSection } from './sections/BrowserCapabilitiesSection';
import { CommunicationDraftsSection } from './sections/CommunicationDraftsSection';
import { OfficeRuntimeSection } from './sections/OfficeRuntimeSection';
import { InfrastructureRuntimeSection } from './sections/InfrastructureRuntimeSection';
import { DevelopmentRuntimeSection } from './sections/DevelopmentRuntimeSection';
import { DesktopSection } from './sections/DesktopSection';
import { AppsHubSection } from './sections/AppsHubSection';
import { ProjectsSection } from './sections/ProjectsSection';
import { AnalyticsSection } from './sections/AnalyticsSection';
import { SettingsSection, type SettingsTab } from './sections/SettingsSection';
import { UpgradeSection } from './sections/UpgradeSection';
import { RatingFeedbackModal } from './RatingFeedbackModal';
import { HelpWidgetLauncher } from '../HelpWidget/HelpWidgetLauncher';
import { SECTION_TITLES, type SectionId } from './sections';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import type { AuthUser, EmailCreateAccountOptions } from '../../auth/AuthTypes';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import { autonomousTaskBillingService } from '../../organization/AutonomousTaskBillingService';
import { AUTONOMOUS_TASK_PRICE_USD } from '../../../shared/organization/AutonomousTaskBillingTypes';
import { referralService } from '../../organization/ReferralService';
import { ipc as ipcBridge } from '../../services/ipc/ipcBridgeImplementation';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Paw Go',
  pro: 'Paw Pro',
  proMax: 'Paw Pro Max',
  team: 'Paw Team',
  enterprise: 'Paw Enterprise',
};

export function Dashboard({
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
  const ipc = useIpcBridge();
  const [active, setActive] = useState<SectionId>('home');
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [tierLabel, setTierLabel] = useState(user.isGuest ? 'Guest Preview' : 'Paw Go');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('Account');

  useEffect(() => {
    ipc.isCompanionEnabled().then(setCompanionEnabled).catch(() => {});
    // Guests have no real subscription — SubscriptionStore is real-account-only,
    // so a guest session must never display a tier it never actually purchased.
    if (!user.isGuest) {
      ipc.billingGetSubscription().then((s) => setTierLabel(TIER_LABELS[s.tier])).catch(() => {});
    }
  }, [ipc, user.isGuest]);

  // Guaranteed to fire regardless of which Settings/Organization tab is
  // open — this is the one place that actually calls the security-definer
  // add_task_credits() RPC after a real Razorpay purchase completes (see
  // CheckoutSyncServer.ts). Billing UI components separately listen to the
  // same event purely to refresh their own displayed balance.
  useEffect(() => {
    if (user.isGuest) return;
    ipc.onTaskCreditsPurchased(({ credits, organizationId }) => {
      autonomousTaskBillingService
        .confirmCreditPurchase(organizationId ?? null, credits, credits * AUTONOMOUS_TASK_PRICE_USD)
        .catch(() => {});
    });
  }, [ipc, user.isGuest]);

  // Reports this account's own subscription conversion to the referral
  // engine whenever the local subscription changes — a no-op unless this
  // account was itself referred and just reached Pro/Pro Max (see
  // report_referral_conversion() in the referral engine migration). Uses
  // the full ipc singleton rather than the useIpcBridge() hook subset
  // since onSubscriptionUpdated isn't in that scoped hook's method list.
  useEffect(() => {
    if (user.isGuest) return;
    ipcBridge.onSubscriptionUpdated(() => {
      ipcBridge
        .billingGetSubscription()
        .then((s) => referralService.reportConversion(s.tier).catch(() => {}))
        .catch(() => {});
    });
  }, [user.isGuest]);

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

  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    setActive('settings');
  };

  const handleProfileAction = (action: ProfileMenuAction) => {
    switch (action) {
      case 'settings':
        openSettingsTab('Account');
        break;
      case 'upgrade':
        // Guests have no plan to upgrade — route to Account so they can
        // create a real account first. Real accounts get the dedicated,
        // full plan-comparison page, not just a Settings tab.
        if (user.isGuest) openSettingsTab('Account');
        else setActive('upgrade');
        break;
      case 'logout':
        onSignOut();
        break;
    }
  };

  const openUrl = (url: string) => void ipc.executeAction({ type: 'openUrl', url });

  return (
    <div className={styles.shell}>
      <RatingFeedbackModal />
      <Sidebar
        active={active}
        onSelect={setActive}
        userName={user.name}
        tierLabel={tierLabel}
        isGuest={user.isGuest}
        companionEnabled={companionEnabled}
        onProfileAction={handleProfileAction}
        onOpenUrl={openUrl}
      />
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.headerTitle}>{SECTION_TITLES[active]}</h1>
        </header>
        <div className={styles.content}>
          {active === 'home' && (
            <OverviewSection
              onNavigate={setActive}
              companionEnabled={companionEnabled}
              companionPending={pending}
              onEnableCompanion={handleEnable}
              onDisableCompanion={handleDisable}
            />
          )}
          {active === 'talk' && (
            <TalkSection enabled={companionEnabled} pending={pending} onEnable={handleEnable} onDisable={handleDisable} />
          )}
          {active === 'companionLab' && <CompanionLabSection />}
          {active === 'projects' && (
            <ProjectsSection onOpenFolder={(path) => void ipc.executeAction({ type: 'openFolder', path })} />
          )}
          {active === 'apps' && <AppsHubSection onNavigate={setActive} />}
          {active === 'analytics' && <AnalyticsSection />}
          {active === 'history' && <ConversationHistorySection />}
          {active === 'workHistory' && <WorkHistorySection />}
          {active === 'browserCapabilities' && <BrowserCapabilitiesSection />}
          {active === 'communicationDrafts' && <CommunicationDraftsSection />}
          {active === 'office' && <OfficeRuntimeSection />}
          {active === 'infrastructure' && <InfrastructureRuntimeSection />}
          {active === 'development' && <DevelopmentRuntimeSection />}
          {active === 'desktop' && <DesktopSection />}
          {active === 'settings' && (
            <SettingsSection
              user={user}
              onSignOut={onSignOut}
              onUpgradeGuestWithGoogle={onUpgradeGuestWithGoogle}
              onUpgradeGuestWithEmail={onUpgradeGuestWithEmail}
              isGoogleSignInAvailable={isGoogleSignInAvailable}
              initialTab={settingsInitialTab}
              onUpgrade={() => setActive('upgrade')}
              onOpenCompanionStudio={() => setActive('companionLab')}
              onRequestPasswordReset={onRequestPasswordReset}
              onVerifyPasswordResetCode={onVerifyPasswordResetCode}
              onCompletePasswordReset={onCompletePasswordReset}
            />
          )}
          {active === 'upgrade' && <UpgradeSection onBack={() => openSettingsTab('Billing')} />}
        </div>
      </main>
      <HelpWidgetLauncher />
    </div>
  );
}
