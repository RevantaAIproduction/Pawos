import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser, EmailCreateAccountOptions, EmailSignInOptions } from '../AuthTypes';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../validation';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

const PAWOS_HOME_URL = 'https://pawos.revantaai.com';

/** Best-effort notification email — a delivery failure must never block the auth flow itself. */
function notify(method: string, to: string, params: unknown): void {
  ipc.mailSend(method, to, params).catch(() => {});
}

/**
 * The backend behind email/password accounts is an implementation detail —
 * the user never sees it, same principle as the AI provider names. Supabase's
 * SDK error messages don't normally name it, but this is the one place they
 * all pass through before reaching the UI, so a stray mention never leaks.
 */
function toUserFacingAuthError(message: string): string {
  return /supabase/i.test(message) ? 'Something went wrong with your account. Please try again.' : message;
}

function toAuthUser(user: SupabaseUser): AuthUser {
  return {
    id: user.id,
    name: (user.user_metadata?.name as string | undefined) ?? user.email ?? 'User',
    email: user.email,
    provider: 'email',
    isGuest: false,
    createdAt: new Date(user.created_at).getTime(),
  };
}

/**
 * Real email/password accounts backed by Supabase Auth — password hashing
 * and verification happen entirely on Supabase's servers (never in this
 * app), and sessions are real, server-issued JWTs that Supabase's own
 * client manages (auto-refresh, persistence). This class only validates
 * shape before calling Supabase and shapes the response into an AuthUser.
 */
export class EmailAuthProvider {
  /**
   * Proves a sign-up code with the server (supabase.auth.verifyOtp). The code was made by PawOS's
   * server and emailed to the address (see src/main/mail/signupCode.ts); whether it is right is
   * decided there, never in this app. Success leaves this client signed in to the verified account,
   * which createAccount() then finishes.
   */
  async verifySignupCode(email: string, code: string, type: 'signup' | 'email'): Promise<{ valid: boolean; reason?: string }> {
    if (!isValidEmail(email)) return { valid: false, reason: 'Enter a valid email address.' };
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type });
    if (error || !data.session) {
      return { valid: false, reason: "That code isn't right or has expired. Check the email or send a new one." };
    }
    return { valid: true };
  }

  /**
   * Finishes creating an account whose email was just verified (verifySignupCode): sets the
   * password and name on that signed-in account. It never creates an account for an address that
   * has not been proven — there is no supabase.auth.signUp() here.
   */
  async createAccount({ name, email, password }: EmailCreateAccountOptions): Promise<AuthUser> {
    if (!name.trim()) throw new Error('Enter your name.');
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    if (!isValidPassword(password)) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

    const supabase = await getSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const verifiedEmail = sessionData.session?.user.email?.toLowerCase();
    if (!verifiedEmail || verifiedEmail !== email.trim().toLowerCase()) {
      throw new Error('Verify your email with the code we sent before choosing a password.');
    }

    const { data, error } = await supabase.auth.updateUser({ password, data: { name: name.trim() } });
    if (error) throw new Error(toUserFacingAuthError(error.message));
    if (!data.user) throw new Error('Something went wrong creating your account. Please try again.');
    notify('sendWelcome', email, { name: name.trim(), launchUrl: PAWOS_HOME_URL });
    return toAuthUser(data.user);
  }

  async signIn({ email, password }: EmailSignInOptions): Promise<AuthUser> {
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(toUserFacingAuthError(error.message));
    if (!data.user) throw new Error('Something went wrong signing in. Please try again.');
    const user = toAuthUser(data.user);
    notify('sendLoginAlert', email, { name: user.name, variant: 'success', whenText: new Date().toLocaleString() });
    return user;
  }

  /** Restores a real Supabase session on app startup, if one still exists (Supabase's client persists and auto-refreshes it in localStorage). */
  async getSessionUser(): Promise<AuthUser | null> {
    const supabase = await getSupabaseClient().catch(() => null);
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.user ? toAuthUser(data.session.user) : null;
  }

  /**
   * 'global' (the default) ends every session of the account — PawOS Web and other devices too, so
   * signing out anywhere signs out everywhere. 'local' only forgets this device's session.
   */
  async signOut(scope: 'global' | 'local' = 'global'): Promise<void> {
    const supabase = await getSupabaseClient().catch(() => null);
    await supabase?.auth.signOut({ scope });
  }

  /**
   * Commits a new password after PawOS's own OTP + signed reset token
   * (otp.ts + passwordResetToken.ts, verified by the caller before this is
   * reached) have proven ownership of the email. Supabase's client SDK only
   * allows updateUser({password}) for the CURRENTLY authenticated session —
   * there's no way to set another, currently-signed-out user's password
   * with only the anon/publishable key (by design, see supabaseClient.ts).
   * This succeeds for "change password while still signed in as this
   * email"; a full "forgot password, fully signed out" reset needs either a
   * trusted backend holding the Supabase service-role key, or bridging
   * through Supabase's own resetPasswordForEmail/verifyOtp(type:'recovery')
   * flow — neither exists yet. Business Configuration Required for that gap.
   */
  async resetPassword(email: string, newPassword: string): Promise<{ ok: boolean; reason?: string }> {
    if (!isValidPassword(newPassword)) return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    const supabase = await getSupabaseClient().catch(() => null);
    if (!supabase) return { ok: false, reason: 'Account services are not configured yet.' };

    const { data: sessionData } = await supabase.auth.getSession();
    const sessionEmail = sessionData.session?.user.email?.toLowerCase();
    if (!sessionEmail || sessionEmail !== email.trim().toLowerCase()) {
      return {
        ok: false,
        reason:
          "Your reset code was verified, but this device isn't currently signed in as that account, so the password can't be changed yet. " +
          'Completing a reset with no active session needs a secure backend (Business Configuration Required) — for now, sign in first, then use "Change password" from Account settings.',
      };
    }

    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, reason: toUserFacingAuthError(error.message) };
    if (data.user) notify('sendPasswordChanged', email, { name: toAuthUser(data.user).name, whenText: new Date().toLocaleString() });
    return { ok: true };
  }
}
