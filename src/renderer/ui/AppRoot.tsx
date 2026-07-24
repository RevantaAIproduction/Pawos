import React, { useCallback, useEffect, useState } from 'react';
import { SplashScreen } from './Splash/SplashScreen';
import { AuthScreen } from './Auth/AuthScreen';
import { Dashboard } from './Dashboard/Dashboard';
import { OnboardingWizard } from './Onboarding/OnboardingWizard';
import { useAuth } from '../auth/useAuth';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import type { ThemeMode } from '../services/ipc/ipcTypes';

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
        onSignInWithEmail={(options) => goToDashboardAfter(auth.signInWithEmail(options))}
        onCreateEmailAccount={(options) => goToDashboardAfter(auth.createEmailAccount(options))}
        onContinueAsGuest={() => goToDashboardAfter(auth.continueAsGuest())}
        onRequestPasswordReset={auth.requestPasswordReset}
        onVerifyPasswordResetCode={auth.verifyPasswordResetCode}
        onCompletePasswordReset={auth.completePasswordReset}
        onSendVerificationCode={auth.sendVerificationCode}
        onVerifyEmailCode={auth.verifyEmailCode}
        isGoogleSignInAvailable={auth.isGoogleSignInAvailable}
      />
    );
  }

  if (stage === 'onboarding') {
    return <OnboardingWizard user={auth.user} onFinish={() => setStage('dashboard')} />;
  }

  return (
    <Dashboard
      user={auth.user}
      onSignOut={async () => {
        await auth.signOut();
        setStage('auth');
      }}
      onUpgradeGuestWithGoogle={auth.upgradeGuestWithGoogle}
      onUpgradeGuestWithEmail={auth.upgradeGuestWithEmail}
      isGoogleSignInAvailable={auth.isGoogleSignInAvailable}
      onRequestPasswordReset={auth.requestPasswordReset}
      onVerifyPasswordResetCode={auth.verifyPasswordResetCode}
      onCompletePasswordReset={auth.completePasswordReset}
    />
  );
}
