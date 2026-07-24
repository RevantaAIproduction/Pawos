import type {
  AuthService,
  AuthUser,
  EmailCreateAccountOptions,
  EmailSignInOptions,
} from './AuthTypes';
import { EmailAuthProvider } from './providers/EmailAuthProvider';
import { GoogleAuthProvider } from './providers/GoogleAuthProvider';
import { GitHubAuthProvider } from './providers/GitHubAuthProvider';
import { GuestAuthProvider } from './providers/GuestAuthProvider';
import { ipc } from '../services/ipc/ipcBridgeImplementation';

const STORAGE_KEY = 'pawos:auth:user';
const REMEMBER_KEY = 'pawos:auth:rememberMe';

/**
 * The one place the rest of PawOS touches for authentication (via useAuth)
 * — routes each call to whichever real IdentityProvider it needs. Nothing
 * outside this file should import GoogleAuthProvider/EmailAuthProvider/
 * GuestAuthProvider directly; that's the whole point of the interface.
 *
 * Email accounts are real Supabase-backed sessions (server-issued JWTs,
 * Supabase's own client persists/refreshes them) — getCurrentUser() checks
 * that directly rather than trusting a local copy. Guest and Google
 * sessions have no external session of their own, so those stay as a
 * local profile record in localStorage.
 *
 * "Remember Me" unchecked means: don't restore this session on the next
 * app start. For guest/Google that's just not reading the local record
 * back; for email accounts it also explicitly signs out of Supabase on the
 * next startup check, so a real session token doesn't linger unused.
 */
export class AuthenticationProvider implements AuthService {
  private emailProvider = new EmailAuthProvider();
  private googleProvider = new GoogleAuthProvider();
  private githubProvider = new GitHubAuthProvider();
  private guestProvider = new GuestAuthProvider();

  private setSession(user: AuthUser, rememberMe = true): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(rememberMe));
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const user = await this.googleProvider.signIn();
    this.setSession(user);
    return user;
  }

  async signInWithGithub(): Promise<AuthUser> {
    const user = await this.githubProvider.signIn();
    this.setSession(user);
    return user;
  }

  async signInWithEmail(options: EmailSignInOptions): Promise<AuthUser> {
    const user = await this.emailProvider.signIn(options);
    this.setSession(user, options.rememberMe ?? true);
    return user;
  }

  async createEmailAccount(options: EmailCreateAccountOptions): Promise<AuthUser> {
    const user = await this.emailProvider.createAccount(options);
    this.setSession(user);
    return user;
  }

  async continueAsGuest(): Promise<AuthUser> {
    const user = await this.guestProvider.continueAsGuest();
    this.setSession(user);
    return user;
  }

  // No explicit data migration happens here: none of PawOS's local stores
  // (companion, memories, settings, conversations, projects) are
  // namespaced per-user yet — they were never tied to the guest's id in
  // the first place, so replacing the session record *is* the entire
  // "merge". If per-user namespacing is ever added, this is where a real
  // migration step would need to go.
  async upgradeGuestWithGoogle(): Promise<AuthUser> {
    const user = await this.googleProvider.signIn();
    this.setSession(user);
    if (user.email) {
      // A genuine "linking" event — a guest session becoming a real Google
      // identity — unlike a plain signInWithGoogle, which can't be told
      // apart from a returning sign-in without a backend user record.
      ipc.mailSend('sendGoogleAccountLinked', user.email, { name: user.name, email: user.email }).catch(() => {});
    }
    return user;
  }

  async upgradeGuestWithEmail(options: EmailCreateAccountOptions): Promise<AuthUser> {
    const user = await this.emailProvider.createAccount(options);
    this.setSession(user);
    return user;
  }

  async requestPasswordReset(email: string): Promise<{ expiresInMinutes: number }> {
    return ipc.authSendPasswordResetOtp(email);
  }

  async verifyPasswordResetCode(email: string, code: string): Promise<{ valid: boolean; reason?: string; resetToken?: string }> {
    const result = await ipc.authVerifyPasswordResetOtp(email, code);
    return { valid: result.valid, reason: result.reason, resetToken: result.token };
  }

  async completePasswordReset(resetToken: string, newPassword: string): Promise<{ ok: boolean; reason?: string }> {
    const { valid, email, reason } = await ipc.authValidatePasswordResetToken(resetToken);
    if (!valid || !email) return { ok: false, reason: reason ?? 'This reset link is no longer valid.' };
    return this.emailProvider.resetPassword(email, newPassword);
  }

  async sendVerificationCode(email: string): Promise<{ expiresInMinutes: number }> {
    return ipc.authSendOtp(email);
  }

  async verifyEmailCode(email: string, code: string): Promise<{ valid: boolean; reason?: string }> {
    return ipc.authVerifyOtp(email, code);
  }

  async signOut(): Promise<void> {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
    await this.emailProvider.signOut(); // clears the real Supabase session too, not just the local mirror
  }

  private readRememberMe(): boolean {
    try {
      return JSON.parse(window.localStorage.getItem(REMEMBER_KEY) ?? 'true');
    } catch {
      return true;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    if (!this.readRememberMe()) {
      // "Remember Me" was off last time — require signing in again, and
      // make sure a real Supabase session doesn't linger unused.
      window.localStorage.removeItem(STORAGE_KEY);
      await this.emailProvider.signOut().catch(() => {});
      return null;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const localUser = raw ? (JSON.parse(raw) as AuthUser) : null;
      if (localUser && localUser.provider !== 'email') return localUser; // guest/Google — no external session to check
    } catch {
      // fall through to the Supabase session check
    }

    // Email accounts: trust the real Supabase session, not the local copy.
    return this.emailProvider.getSessionUser();
  }

  async isGoogleSignInAvailable(): Promise<boolean> {
    return this.googleProvider.isAvailable();
  }

  async isGithubSignInAvailable(): Promise<boolean> {
    return this.githubProvider.isAvailable();
  }
}

export const authService = new AuthenticationProvider();
