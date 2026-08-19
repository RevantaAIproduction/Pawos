import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import { Sidebar } from './Sidebar';
import { TicketBalanceIndicator } from './TicketBalanceIndicator';
import type { ProfileMenuAction } from './ProfileMenu';
import { OverviewSection } from './sections/OverviewSection';
import { CompanionLabSection } from './sections/CompanionLabSection';
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
import { HelpWidgetPanel } from '../HelpWidget/HelpWidgetPanel';
import { HelpBubbleIcon } from './NavIcons';
import type { SectionId } from './sections';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';
import type { AuthUser } from '../../auth/AuthTypes';
import type { SubscriptionTierId } from '../../../shared/billing/BillingTypes';
import { autonomousTaskBillingService } from '../../organization/AutonomousTaskBillingService';
import { referralService } from '../../organization/ReferralService';
import { ipc as ipcBridge } from '../../services/ipc/ipcBridgeImplementation';

const TIER_LABELS: Record<SubscriptionTierId, string> = {
  go: 'Go',
  pro: 'Pro',
  proMax: 'Pro Max',
  team: 'Team',
  enterprise: 'Enterprise',
};

export function Dashboard({
  user,
  onSignOut,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
}: {
  user: AuthUser;
  onSignOut: () => void;
  onRequestPasswordReset: (email: string) => Promise<{ expiresInMinutes: number }>;
  onVerifyPasswordResetCode: (email: string, code: string) => Promise<{ valid: boolean; reason?: string; resetToken?: string }>;
  onCompletePasswordReset: (resetToken: string, newPassword: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const ipc = useIpcBridge();
  const [active, setActive] = useState<SectionId>('home');
  // Real navigation history (not a fabricated stack) — every section change goes through
  // navigateTo() below, which pushes the section being left onto this before switching, so Back
  // always returns to wherever the user actually was, not a guessed "previous" screen.
  const [navHistory, setNavHistory] = useState<SectionId[]>([]);
  const navigateTo = useCallback((id: SectionId) => {
    setActive((current) => {
      if (current !== id) setNavHistory((h) => [...h, current]);
      return id;
    });
  }, []);
  const goBack = useCallback(() => {
    setNavHistory((h) => {
      if (h.length === 0) return h;
      const next = [...h];
      const prev = next.pop()!;
      setActive(prev);
      return next;
    });
  }, []);
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  // companion:enable resolves the instant the overlay window is created —
  // its 3D asset (FBX model, animations) keeps loading for a few more
  // seconds in that separate window with zero signal back here otherwise,
  // which is exactly the gap the "nothing happens after Enable" report was
  // about. This stays true until the overlay's own onReady fires (or a
  // generous timeout, in case the ready signal is ever missed).
  const [companionWaking, setCompanionWaking] = useState(false);
  const wakeTimeoutRef = useRef<number | null>(null);

  const clearWakeTimeout = useCallback(() => {
    if (wakeTimeoutRef.current !== null) {
      window.clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
  }, []);
  const [tierLabel, setTierLabel] = useState(user.isGuest ? 'Guest Preview' : 'Go');
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('Account');
  const [helpWidgetOpen, setHelpWidgetOpen] = useState(false);
  const [helpWidgetInitialTab, setHelpWidgetInitialTab] = useState<'home' | 'messages' | 'help'>('home');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);

  const openSupportMessages = useCallback(() => {
    setHelpWidgetInitialTab('messages');
    setHelpWidgetOpen(true);
  }, []);

  useEffect(() => {
    ipc.isCompanionEnabled().then(setCompanionEnabled).catch(() => {});
    // Guests have no real subscription — SubscriptionStore is real-account-only,
    // so a guest session must never display a tier it never actually purchased.
    if (!user.isGuest) {
      ipc.billingGetSubscription().then((s) => setTierLabel(TIER_LABELS[s.tier])).catch(() => {});
    }
  }, [ipc, user.isGuest]);

  useEffect(() => {
    ipc.onCompanionReady(() => {
      setCompanionWaking(false);
      clearWakeTimeout();
    });
  }, [ipc, clearWakeTimeout]);

  // The companion overlay's "Upgrade" button (on a locked model, or the usage-exhaustion
  // flow) has no billing UI of its own — it asks the main process to focus this window and
  // land here, on the real Upgrade/Billing page, instead of a local preference panel.
  useEffect(() => {
    ipc.onUiNavigateUpgrade(() => navigateTo('upgrade'));
  }, [ipc]);

  // P0-2 security fix: this used to be the one place that called the security-definer
  // add_ticket_balance() RPC directly with a client-supplied amount after an UNVERIFIED loopback
  // ping — see CheckoutSyncServer.ts and TaskCreditsSection.tsx/AutonomousTaskBillingCard.tsx's own
  // updated comments. The RPC that call used is now service-role-only (see the
  // 20260814000000_p0_payment_verification_hardening.sql migration); crediting now happens
  // exclusively in pawos-web's /api/billing/credit-ticket-balance route, only after it has
  // independently verified the Razorpay payment signature and re-fetched the real captured amount
  // from Razorpay's own API. This handler no longer credits anything — it exists only so this
  // effect remains the documented, guaranteed-to-fire listener; billing UI components separately
  // listen to the same event purely to refresh their own already-correct balance display.
  useEffect(() => {
    if (user.isGuest) return;
    ipc.onTaskCreditsPurchased(() => {});
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

  // Deterministic, server-side safety net for Autonomous Ticket runs the
  // model itself never resolved (never called complete/end) — runs
  // unconditionally once per app session, never gated behind any model
  // tool call. Never bills anything; it only guarantees a stale run's
  // fate is recorded in usage history rather than left invisible in
  // 'running' state forever. See reconcileStaleRuns()'s own comment.
  useEffect(() => {
    if (user.isGuest) return;
    autonomousTaskBillingService.reconcileStaleRuns().catch(() => {});
  }, [user.isGuest]);

  const handleEnable = useCallback(async () => {
    setPending(true);
    try {
      await ipc.enableCompanion();
      setCompanionEnabled(true);
      setCompanionWaking(true);
      clearWakeTimeout();
      wakeTimeoutRef.current = window.setTimeout(() => setCompanionWaking(false), 20000);
    } finally {
      setPending(false);
    }
  }, [ipc, clearWakeTimeout]);

  const handleDisable = useCallback(async () => {
    setPending(true);
    try {
      await ipc.disableCompanion();
      setCompanionEnabled(false);
      setCompanionWaking(false);
      clearWakeTimeout();
    } finally {
      setPending(false);
    }
  }, [ipc, clearWakeTimeout]);

  const openSettingsTab = (tab: SettingsTab) => {
    setSettingsInitialTab(tab);
    navigateTo('settings');
  };

  const openWorkRecord = (id: string) => {
    setSelectedWorkId(id);
    navigateTo('workHistory');
  };

  const handleProfileAction = (action: ProfileMenuAction) => {
    switch (action) {
      case 'settings':
        openSettingsTab('Account');
        break;
      case 'upgrade':
        navigateTo('upgrade');
        break;
      case 'logout':
        onSignOut();
        break;
      case 'help':
        setHelpWidgetInitialTab('home');
        setHelpWidgetOpen(true);
        break;
    }
  };

  const openUrl = (url: string) => void ipc.executeAction({ type: 'openUrl', url });

  return (
    <div className={styles.shell}>
      <RatingFeedbackModal />
      <Sidebar
        active={active}
        onSelect={navigateTo}
        onBack={goBack}
        canGoBack={navHistory.length > 0}
        userName={user.name}
        tierLabel={tierLabel}
        isGuest={user.isGuest}
        companionEnabled={companionEnabled}
        onProfileAction={handleProfileAction}
        onOpenUrl={openUrl}
      />
      <main className={styles.main}>
        <div className={styles.topBar}>
          <TicketBalanceIndicator isGuest={user.isGuest} onOpen={() => openSettingsTab('Billing')} />
        </div>
        <div className={styles.content}>
          {active === 'home' && (
            <OverviewSection
              onNavigate={setActive}
              companionEnabled={companionEnabled}
              companionPending={pending}
              companionWaking={companionWaking}
              onEnableCompanion={handleEnable}
              onDisableCompanion={handleDisable}
              onOpenWorkRecord={openWorkRecord}
            />
          )}
          {active === 'companionLab' && (
            <CompanionLabSection
              enabled={companionEnabled}
              pending={pending}
              waking={companionWaking}
              onEnable={handleEnable}
              onDisable={handleDisable}
            />
          )}
          {active === 'projects' && (
            <ProjectsSection onOpenFolder={(path) => void ipc.executeAction({ type: 'openFolder', path })} />
          )}
          {active === 'apps' && <AppsHubSection onNavigate={setActive} />}
          {active === 'analytics' && <AnalyticsSection user={user} />}
          {active === 'workHistory' && <WorkHistorySection selectedWorkId={selectedWorkId} />}
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
              initialTab={settingsInitialTab}
              onUpgrade={() => setActive('upgrade')}
              onOpenCompanionStudio={() => setActive('companionLab')}
              onRequestPasswordReset={onRequestPasswordReset}
              onVerifyPasswordResetCode={onVerifyPasswordResetCode}
              onCompletePasswordReset={onCompletePasswordReset}
              onOpenSupportMessages={openSupportMessages}
            />
          )}
          {active === 'upgrade' && <UpgradeSection onBack={() => openSettingsTab('Billing')} />}
        </div>
      </main>
      {!helpWidgetOpen && (
        <button
          type="button"
          className={styles.helpLauncher}
          aria-label="Open Help and Support"
          onClick={() => {
            setHelpWidgetInitialTab('home');
            setHelpWidgetOpen(true);
          }}
        >
          <HelpBubbleIcon />
        </button>
      )}
      {helpWidgetOpen && <HelpWidgetPanel initialTab={helpWidgetInitialTab} onClose={() => setHelpWidgetOpen(false)} />}
    </div>
  );
}
