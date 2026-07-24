import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import type { GoogleProfile } from '../../../shared/auth/AccountTypes';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

function toAuthUser(profile: GoogleProfile, supabaseUserId: string | null): AuthUser {
  return {
    id: supabaseUserId ?? `google:${profile.sub}`,
    name: profile.name,
    email: profile.email,
    pictureUrl: profile.picture,
    provider: 'google',
    isGuest: false,
    createdAt: Date.now(),
  };
}

/**
 * Bridges a completed Google sign-in into a real Supabase session, so
 * Supabase-backed features (Organizations and their RLS policies) can see
 * this user via auth.uid() — without this, a Google-signed-in PawOS user
 * is fully authenticated locally but invisible to Supabase, and every
 * Organization action fails with "You must be signed in...".
 *
 * Requires the Supabase project's Auth settings to have the Google
 * provider enabled with this app's GOOGLE_CLIENT_ID added to its allowed
 * client ID list (Supabase dashboard → Authentication → Providers →
 * Google → "Authorized Client IDs") — that's a one-time dashboard
 * configuration step, not something this code can do. If it isn't
 * configured yet, this fails silently (best-effort) so basic Google
 * sign-in still works for users who never touch Organizations; the real
 * error surfaces later, at the point an Organization action is attempted.
 */
async function linkSupabaseSession(idToken: string, accessToken: string): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, access_token: accessToken });
    if (error) {
      console.warn('Google→Supabase session link failed:', error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    console.warn('Google→Supabase session link failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Real Google OAuth (Authorization Code + PKCE via a loopback server — see
 * src/main/auth/GoogleOAuthFlow.ts) — the actual browser/token exchange
 * happens in the main process; this class shapes the returned profile into
 * an AuthUser and bridges the same sign-in into a real Supabase session
 * (see linkSupabaseSession above). Requires GOOGLE_CLIENT_ID in .env;
 * isAvailable() lets the UI show an honest "not configured yet" state
 * instead of a button that fails silently.
 */
export class GoogleAuthProvider {
  async isAvailable(): Promise<boolean> {
    return ipc.authIsGoogleSignInConfigured();
  }

  async signIn(): Promise<AuthUser> {
    try {
      const { profile, idToken, accessToken } = await ipc.authStartGoogleSignIn();
      const supabaseUserId = await linkSupabaseSession(idToken, accessToken);
      return toAuthUser(profile, supabaseUserId);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
