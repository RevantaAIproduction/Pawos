import type {
  AuthService,
  AuthUser,
  EmailCreateAccountOptions,
  EmailSignInOptions,
} from './AuthTypes';
import { EmailAuthProvider } from './providers/EmailAuthProvider';
import { GoogleAuthProvider } from './providers/GoogleAuthProvider';
import { GitHubAuthProvider } from './providers/GitHubAuthProvider';
import { MicrosoftAuthProvider } from './providers/MicrosoftAuthProvider';
import { ipc } from '../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from './supabaseClient';
import type { SharedAuthSession } from '../../shared/auth/AuthSessionSync';

const STORAGE_KEY = 'pawos:auth:user';
const REMEMBER_KEY = 'pawos:auth:rememberMe';
const SUPABASE_SESSION_KEY = 'pawos:supabase:session';

/**
 * The one place the rest of PawOS touches for authentication (via useAuth)
 * â€” routes each call to whichever real IdentityProvider it needs. Nothing
 * outside this file should import GoogleAuthProvider/EmailAuthProvider
 * directly; that's the whole point of the interface.
 *
 * Email accounts are real Supabase-backed sessions (server-issued JWTs,
 * Supabase's own client persists/refreshes them) â€” getCurrentUser() checks
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
  constructor() {
    // PawOS Build access is server-authoritative and held only in main-process memory
    // (BuildAccessStore.ts), so it must be re-confirmed from Supabase whenever a session appears or
    // its token rotates — including INITIAL_SESSION on app start, when a remembered session is
    // restored without a SIGNED_IN event — and dropped on sign-out.
    getSupabaseClient()
      .then((supabase) => {
        supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
            ipc.billingClearBuildAccess().catch((err) => console.error('[PawOS Build] Clearing Build access failed:', err));
            return;
          }
          if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.access_token) {
            // Deferred: supabase-js runs this callback while holding its auth lock; awaiting IPC
            // inside it would stall other auth calls.
            const accessToken = session.access_token;
            setTimeout(() => {
              ipc
                .billingSyncBuildAccess(accessToken)
                .then((result) => {
                  if (!result.ok) console.error('[PawOS Build] Build access sync failed:', result.reason);
                })
                .catch((err) => console.error('[PawOS Build] Build access sync failed:', err));
            }, 0);
          }
        });
      })
      .catch((err) => console.error('[PawOS Build] Could not subscribe to auth changes for Build sync:', err));
  }
  private googleProvider = new GoogleAuthProvider();
  private githubProvider = new GitHubAuthProvider();
  private microsoftProvider = new MicrosoftAuthProvider();

  private setSession(user: AuthUser, rememberMe = true): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(rememberMe));
  }

  private async saveSupabaseSession(): Promise<void> {
    try {
      const supabase = await getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const session: SharedAuthSession = {
          user_id: data.session.user.id,
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token || '',
          email: data.session.user.email || '',
          provider: data.session.user.user_metadata?.provider || 'unknown',
          created_at: Date.now(),
        };
        window.localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
      }
    } catch (err) {
      console.warn('Failed to save Supabase session:', err);
    }
  }

  private async reconcileSubscriptionFor(user: AuthUser): Promise<void> {
    if (user.isGuest || (user as { provider?: string }).provider === 'guest') return;
    await ipc.billingReconcileForAccount(user.id).catch(() => {});
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const user = await this.googleProvider.signIn();
    await this.reconcileSubscriptionFor(user);
    this.setSession(user);
    await this.saveSupabaseSession();
    return user;
  }

  async signInWithGithub(): Promise<AuthUser> {
    const user = await this.githubProvider.signIn();
    await this.reconcileSubscriptionFor(user);
    this.setSession(user);
    await this.saveSupabaseSession();
    return user;
  }

  async signInWithMicrosoft(): Promise<AuthUser> {
    const user = await this.microsoftProvider.signIn();
    await this.reconcileSubscriptionFor(user);
    this.setSession(user);
    await this.saveSupabaseSession();
    return user;
  }

  async signInWithEmail(options: EmailSignInOptions): Promise<AuthUser> {
    const user = await this.emailProvider.signIn(options);
    await this.reconcileSubscriptionFor(user);
    this.setSession(user, options.rememberMe ?? true);
    return user;
  }

  async createEmailAccount(options: EmailCreateAccountOptions): Promise<AuthUser> {
    const user = await this.emailProvider.createAccount(options);
    await this.reconcileSubscriptionFor(user);
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
    
    // Drop PawOS Build access so it can never carry over to the next account on this device.
    await ipc.billingClearBuildAccess().catch((err) => console.error('[PawOS Build] Clearing Build access on sign-out failed:', err));
    // Local subscription state (subscription.json) is one file per device install, not namespaced
    // per account â€” without this reset, an account that once joined/created a Team/Enterprise org
    // (syncFromOrganization only ever raises the tier, never lowers it) would leave every
    // subsequently signed-in account on this device looking like a Team member. A fresh sign-in
    // starts clean; that account's own real org membership (if any) re-elevates it correctly.
    await ipc.billingResetSubscription().catch(() => {});
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
      // "Remember Me" was off last time â€” require signing in again, and
      // make sure a real Supabase session doesn't linger unused.
      window.localStorage.removeItem(STORAGE_KEY);
      await this.emailProvider.signOut().catch(() => {});
      return null;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const localUser = raw ? (JSON.parse(raw) as AuthUser) : null;
      if (localUser?.isGuest || (localUser as { provider?: string } | null)?.provider === 'guest') {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      if (localUser && localUser.provider !== 'email') {
        // One account id for every sign-in method: the PawOS server account (Supabase) is the source
        // of truth. The local copy only keeps the display name/picture. A saved sign-in with no
        // server session — e.g. an older local-only "google:…" id — is dropped, so the next sign-in
        // lands on the real account.
        const supabase = await getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (!sessionUser) {
          window.localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        const user: AuthUser = { ...localUser, id: sessionUser.id, email: sessionUser.email ?? localUser.email };
        if (user.id !== localUser.id || user.email !== localUser.email) this.setSession(user);
        await this.reconcileSubscriptionFor(user);
        return user;
      }
    } catch {
      // fall through to the Supabase session check
    }

    // Email accounts: trust the real Supabase session, not the local copy.
    const user = await this.emailProvider.getSessionUser();
    if (user) await this.reconcileSubscriptionFor(user);
    return user;
  }

  async isGoogleSignInAvailable(): Promise<boolean> {
    return this.googleProvider.isAvailable();
  }

  async isGithubSignInAvailable(): Promise<boolean> {
    return this.githubProvider.isAvailable();
  }

  async isMicrosoftSignInAvailable(): Promise<boolean> {
    return this.microsoftProvider.isAvailable();
  }
}

export const authService = new AuthenticationProvider();




