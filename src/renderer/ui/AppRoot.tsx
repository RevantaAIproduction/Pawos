import React, { useCallback, useEffect, useState } from 'react';
import { SplashScreen } from './Splash/SplashScreen';
import { AuthScreen } from './Auth/AuthScreen';
import { Dashboard } from './Dashboard/Dashboard';
import { useAuth } from '../auth/useAuth';

type Stage = 'splash' | 'auth' | 'dashboard';

export default function AppRoot() {
  const auth = useAuth();
  const [stage, setStage] = useState<Stage>('splash');
  const [splashDone, setSplashDone] = useState(false);

  // Session restoration checks a real Supabase session for email accounts
  // (async), so it can still be loading after the splash timer finishes —
  // stay on the splash screen rather than flashing the auth screen first.
  useEffect(() => {
    if (!splashDone || auth.isLoadingUser) return;
    setStage(auth.isAuthenticated ? 'dashboard' : 'auth');
  }, [splashDone, auth.isLoadingUser, auth.isAuthenticated]);

  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  const goToDashboardAfter = useCallback(function <T>(promise: Promise<T>): Promise<T> {
    return promise.then((result) => {
      setStage('dashboard');
      return result;
    });
  }, []);

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
        onSendVerificationCode={auth.sendVerificationCode}
        onVerifyEmailCode={auth.verifyEmailCode}
        isGoogleSignInAvailable={auth.isGoogleSignInAvailable}
      />
    );
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
