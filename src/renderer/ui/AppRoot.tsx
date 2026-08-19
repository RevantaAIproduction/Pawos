import React, { useCallback, useEffect, useState } from 'react';
import { SplashScreen } from './Splash/SplashScreen';
import { AuthScreen } from './Auth/AuthScreen';
import { Dashboard } from './Dashboard/Dashboard';
import { OnboardingWizard } from './Onboarding/OnboardingWizard';
import { useAuth } from '../auth/useAuth';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { startNotificationDispatcher } from '../mobilePresence/NotificationRuntime';
import { startTicketNotificationWatcher } from '../infrastructure/TicketNotificationWatcher';
import { useOrganizationTierSync } from '../organization/useOrganizationTierSync';
import type { ThemeMode } from '../services/ipc/ipcTypes';
import type { AuthUser } from '../auth/AuthTypes';

/**
 * Notification Runtime (MOB-7) — mounted only for a real, signed-in, paid
 * account (Guest has no Supabase session to subscribe with, and Go accounts
 * have no push-capable trusted devices to notify anyway). Renders nothing;
 * its only job is to keep the Cross Device Runtime subscription alive for as
 * long as the dashboard is mounted.
 */
function NotificationDispatcher({ user }: { user: AuthUser }) {
  useEffect(() => {
    if (user.isGuest) return;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    ipc
      .entitlementIsFeatureAvailable('mobileNotifications')
      .then((available) => {
        if (cancelled || !available) return;
        unsubscribe = startNotificationDispatcher(user.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user.isGuest, user.id]);

  return null;
}

/**
 * Ticket Notifications — periodic urgency/deadline check across every connected project
 * management connector (Jira/Linear/GitHub Issues). Desktop delivery (companionShowNotification)
 * needs no entitlement gate — Notification is a plain OS API, not a paid feature. Mobile delivery
 * rides the same 'connectorAlert' path NotificationDispatcher above already uses, which already
 * silently no-ops when there's no paired, push-capable device — so no separate gate is needed here
 * either. Skipped for Guest (no real connected tickets to watch).
 */
function TicketNotifications({ user }: { user: AuthUser }) {
  useEffect(() => {
    if (user.isGuest) return;
    return startTicketNotificationWatcher(user.id);
  }, [user.isGuest, user.id]);

  return null;
}

type Stage = 'splash' | 'auth' | 'onboarding' | 'dashboard';

function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): 'dark' | 'light' {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

/** Applies SettingsState.themeMode to the document root as data-theme, reacting
 * to both local changes and the 'settings:updated' push (e.g. set from another
 * window) and OS-level scheme changes while in 'system' mode. */
function useThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let mode: ThemeMode = 'dark';

    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(mode, media.matches);
    };

    ipc.settingsGet().then((s) => {
      mode = s.themeMode ?? 'dark';
      apply();
    }).catch(() => {});

    const onMediaChange = () => apply();
    media.addEventListener('change', onMediaChange);

    ipc.onSettingsUpdated((s) => {
      mode = s.themeMode ?? 'dark';
      apply();
    });

    return () => media.removeEventListener('change', onMediaChange);
  }, []);
}

export default function AppRoot() {
  const auth = useAuth();
  const [stage, setStage] = useState<Stage>('splash');
  const [splashDone, setSplashDone] = useState(false);

  useThemeSync();

  // Runs as soon as a real signed-in session exists, before either the onboarding wizard or the
  // dashboard renders -- so mobile pairing (reachable from both) always sees an accurate tier.
  // See useOrganizationTierSync's own doc comment for why this can't wait for Settings -> Account.
  useOrganizationTierSync(auth.user?.id, auth.user?.isGuest ?? true);

  const decidePostAuthStage = useCallback(async () => {
    const onboarding = await ipc.onboardingGet().catch(() => ({ completed: true, step: 0, defaultWorkspacePath: null }));
    setStage(onboarding.completed ? 'dashboard' : 'onboarding');
  }, []);

  // Session restoration checks a real Supabase session for email accounts
  // (async), so it can still be loading after the splash timer finishes —
  // stay on the splash screen rather than flashing the auth screen first.
  useEffect(() => {
    if (!splashDone || auth.isLoadingUser) return;
    if (auth.isAuthenticated) {
      void decidePostAuthStage();
    } else {
      setStage('auth');
    }
  }, [splashDone, auth.isLoadingUser, auth.isAuthenticated, decidePostAuthStage]);

  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  const goToDashboardAfter = useCallback(
    function <T>(promise: Promise<T>): Promise<T> {
      return promise.then((result) => {
        void decidePostAuthStage();
        return result;
      });
    },
    [decidePostAuthStage]
  );

  if (stage === 'splash') {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  if (stage === 'auth' || !auth.user) {
    return (
      <AuthScreen
        onSignInWithGoogle={() => goToDashboardAfter(auth.signInWithGoogle())}
        onSignInWithGithub={() => goToDashboardAfter(auth.signInWithGithub())}
        onSignInWithEmail={(options) => goToDashboardAfter(auth.signInWithEmail(options))}
        onCreateEmailAccount={(options) => goToDashboardAfter(auth.createEmailAccount(options))}
        onRequestPasswordReset={auth.requestPasswordReset}
        onVerifyPasswordResetCode={auth.verifyPasswordResetCode}
        onCompletePasswordReset={auth.completePasswordReset}
        onSendVerificationCode={auth.sendVerificationCode}
        onVerifyEmailCode={auth.verifyEmailCode}
        isGoogleSignInAvailable={auth.isGoogleSignInAvailable}
        isGithubSignInAvailable={auth.isGithubSignInAvailable}
      />
    );
  }

  if (stage === 'onboarding') {
    return <OnboardingWizard user={auth.user} onFinish={() => setStage('dashboard')} />;
  }

  return (
    <>
      <NotificationDispatcher user={auth.user} />
      <TicketNotifications user={auth.user} />
      <Dashboard
        user={auth.user}
        onSignOut={async () => {
          await auth.signOut();
          setStage('auth');
        }}
        onRequestPasswordReset={auth.requestPasswordReset}
        onVerifyPasswordResetCode={auth.verifyPasswordResetCode}
        onCompletePasswordReset={auth.completePasswordReset}
      />
    </>
  );
}
