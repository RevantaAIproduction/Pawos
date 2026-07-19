import React, { useCallback, useEffect, useState } from 'react';
import { SplashScreen } from './Splash/SplashScreen';
import { AuthScreen } from './Auth/AuthScreen';
import { Dashboard } from './Dashboard/Dashboard';
import { OnboardingWizard } from './Onboarding/OnboardingWizard';
import { useAuth } from '../auth/useAuth';
import { ipc } from '../services/ipc/ipcBridgeImplementation';

type Stage = 'splash' | 'auth' | 'onboarding' | 'dashboard';

export default function AppRoot() {
  const auth = useAuth();
  const [stage, setStage] = useState<Stage>('splash');
  const [splashDone, setSplashDone] = useState(false);

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
    />
  );
}
