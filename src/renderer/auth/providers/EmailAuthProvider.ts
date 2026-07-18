import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser, EmailCreateAccountOptions, EmailSignInOptions } from '../AuthTypes';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../validation';
import { ipc } from '../../services/ipc/ipcBridgeImplementation';

const PAWOS_HOME_URL = 'https://revantaai.com';

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
  async createAccount({ name, email, password }: EmailCreateAccountOptions): Promise<AuthUser> {
    if (!name.trim()) throw new Error('Enter your name.');
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    if (!isValidPassword(password)) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw new Error(toUserFacingAuthError(error.message));
    if (!data.user) throw new Error('Something went wrong creating your account. Please try again.');
    // The account exists in Supabase from this point regardless of whether
    // a session was issued immediately, so the welcome email fires here.
    notify('sendWelcome', email, { name: name.trim(), launchUrl: PAWOS_HOME_URL });
    if (!data.session) {
      // This project's "Confirm email" setting is on, so Supabase withheld
      // a session and will send its OWN confirmation email — on top of the
      // OTP the user already verified. Turning that setting off (Supabase
      // dashboard → Authentication → Sign In / Providers → Email) is the
      // real fix, since our own OTP already proved this email is real;
      // that's a project-settings change, not something this code can do.
      throw new Error('Account created — check your email to confirm it, then sign in.');
    }
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

  async signOut(): Promise<void> {
    const supabase = await getSupabaseClient().catch(() => null);
    await supabase?.auth.signOut();
  }
}
