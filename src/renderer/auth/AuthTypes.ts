export type AuthProviderId = 'google' | 'github' | 'microsoft' | 'apple' | 'email' | 'guest';

/** Providers wired up and working in this version. GitHub/Microsoft/Apple are visible in the UI as "Coming soon" but have no IdentityProvider behind them yet. */
export const SUPPORTED_PROVIDERS: ReadonlySet<AuthProviderId> = new Set(['google', 'email', 'guest']);

export type AuthUser = {
  id: string;
  name: string;
  email?: string;
  pictureUrl?: string;
  provider: AuthProviderId;
  isGuest: boolean;
  createdAt: number;
};

export type EmailSignInOptions = { email: string; password: string; rememberMe?: boolean };
export type EmailCreateAccountOptions = { name: string; email: string; password: string };

/**
 * Swappable auth backend — the rest of PawOS depends only on this
 * interface (via useAuth), never on Google/email/guest specifics directly.
 * AuthenticationProvider (the real implementation) routes each method to
 * the matching IdentityProvider — see providers/.
 */
export interface AuthService {
  signInWithGoogle(): Promise<AuthUser>;
  signInWithEmail(options: EmailSignInOptions): Promise<AuthUser>;
  createEmailAccount(options: EmailCreateAccountOptions): Promise<AuthUser>;
  continueAsGuest(): Promise<AuthUser>;
  /** Signs the current guest in as a real account, keeping the same local id (see providers/GuestAuthProvider.ts for why nothing needs to be "merged" today). */
  upgradeGuestWithGoogle(): Promise<AuthUser>;
  upgradeGuestWithEmail(options: EmailCreateAccountOptions): Promise<AuthUser>;
  /** UI placeholder only — no email delivery exists yet. */
  requestPasswordReset(email: string): Promise<void>;
  /** Sends a real 6-digit email-ownership code — proves the entered address before createEmailAccount is ever called. */
  sendVerificationCode(email: string): Promise<{ expiresInMinutes: number }>;
  verifyEmailCode(email: string, code: string): Promise<{ valid: boolean; reason?: string }>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
  isGoogleSignInAvailable(): Promise<boolean>;
}
