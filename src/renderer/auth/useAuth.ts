import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from './supabaseClient';
import { authService } from './AuthenticationProvider';
import type { AuthUser, EmailCreateAccountOptions, EmailSignInOptions } from './AuthTypes';

/** How often a signed-in app re-checks that its session wasn't ended on PawOS Web. */
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Restoring a session now means checking a real Supabase session (an
  // async network-adjacent call for email accounts), not just reading
  // localStorage synchronously — AppRoot waits on this before deciding
  // whether to show the auth screen, so it doesn't flash before a valid
  // session is found.
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authService.getCurrentUser().then((restored) => {
      if (cancelled) return;
      setUser(restored);
      setIsLoadingUser(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const signedInUser = await authService.signInWithGoogle();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  // One account across PawOS Desktop and PawOS Web: signing out on the web (or switching account
  // there, which signs the old one out) ends this app's session too. supabase-js reports it when a
  // token refresh is refused; checking on focus and every few minutes notices it sooner.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const endIfSignedOutElsewhere = async () => {
      if (cancelled || (await authService.isSessionStillValid())) return;
      await authService.clearLocalSession();
      if (!cancelled) setUser(null);
    };
    let unsubscribe = () => {};
    getSupabaseClient()
      .then((supabase) => {
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') setTimeout(() => void endIfSignedOutElsewhere(), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
        if (cancelled) unsubscribe();
      })
      .catch(() => {});
    const onFocus = () => void endIfSignedOutElsewhere();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(onFocus, SESSION_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [user]);

  const signInWithGithub = useCallback(async () => {
    const signedInUser = await authService.signInWithGithub();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const signInWithMicrosoft = useCallback(async () => {
    const signedInUser = await authService.signInWithMicrosoft();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const signInWithEmail = useCallback(async (options: EmailSignInOptions) => {
    const signedInUser = await authService.signInWithEmail(options);
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const createEmailAccount = useCallback(async (options: EmailCreateAccountOptions) => {
    const signedInUser = await authService.createEmailAccount(options);
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => authService.requestPasswordReset(email), []);

  const verifyPasswordResetCode = useCallback(
    async (email: string, code: string) => authService.verifyPasswordResetCode(email, code),
    []
  );

  const completePasswordReset = useCallback(
    async (resetToken: string, newPassword: string) => authService.completePasswordReset(resetToken, newPassword),
    []
  );

  const sendVerificationCode = useCallback(async (email: string) => authService.sendVerificationCode(email), []);

  const verifyEmailCode = useCallback(
    async (email: string, code: string) => authService.verifyEmailCode(email, code),
    []
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const isGoogleSignInAvailable = useCallback(() => authService.isGoogleSignInAvailable(), []);
  const isGithubSignInAvailable = useCallback(() => authService.isGithubSignInAvailable(), []);
  const isMicrosoftSignInAvailable = useCallback(() => authService.isMicrosoftSignInAvailable(), []);

  return {
    user,
    isAuthenticated: !!user,
    isLoadingUser,
    signInWithGoogle,
    signInWithGithub,
    signInWithMicrosoft,
    signInWithEmail,
    createEmailAccount,
    requestPasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    sendVerificationCode,
    verifyEmailCode,
    signOut,
    isGoogleSignInAvailable,
    isGithubSignInAvailable,
    isMicrosoftSignInAvailable,
  };
}
