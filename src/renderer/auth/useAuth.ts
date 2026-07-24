import { useCallback, useEffect, useState } from 'react';
import { authService } from './AuthenticationProvider';
import type { AuthUser, EmailCreateAccountOptions, EmailSignInOptions } from './AuthTypes';

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

  const signInWithGithub = useCallback(async () => {
    const signedInUser = await authService.signInWithGithub();
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

  const continueAsGuest = useCallback(async () => {
    const signedInUser = await authService.continueAsGuest();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const upgradeGuestWithGoogle = useCallback(async () => {
    const signedInUser = await authService.upgradeGuestWithGoogle();
    setUser(signedInUser);
    return signedInUser;
  }, []);

  const upgradeGuestWithEmail = useCallback(async (options: EmailCreateAccountOptions) => {
    const signedInUser = await authService.upgradeGuestWithEmail(options);
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

  return {
    user,
    isAuthenticated: !!user,
    isLoadingUser,
    signInWithGoogle,
    signInWithGithub,
    signInWithEmail,
    createEmailAccount,
    continueAsGuest,
    upgradeGuestWithGoogle,
    upgradeGuestWithEmail,
    requestPasswordReset,
    verifyPasswordResetCode,
    completePasswordReset,
    sendVerificationCode,
    verifyEmailCode,
    signOut,
    isGoogleSignInAvailable,
    isGithubSignInAvailable,
  };
}
