import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import { clearServerSessionLinkFailure, getServerSessionLinkFailure, recordServerSessionLinkFailure } from '../serverSessionLink';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

interface MicrosoftProfile {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
  givenName?: string;
}

function toAuthUser(profile: MicrosoftProfile, supabaseUserId: string): AuthUser {
  return {
    // Always the PawOS server account id — one id per person across every sign-in method.
    id: supabaseUserId,
    name: profile.displayName || profile.givenName || profile.userPrincipalName.split('@')[0] || profile.userPrincipalName,
    email: profile.mail || profile.userPrincipalName,
    pictureUrl: undefined,
    provider: 'microsoft',
    isGuest: false,
    createdAt: Date.now(),
  };
}

async function linkSupabaseSession(idToken: string, accessToken: string): Promise<string | null> {
  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'azure',
      token: idToken,
      access_token: accessToken
    });
    if (error) {
      // Keep Supabase's HTTP status and error code with the message — the code is what identifies
      // which check failed (e.g. audience, nonce, provider settings).
      const detail = [error.status ? `HTTP ${error.status}` : '', (error as { code?: string }).code ?? ''].filter(Boolean).join(', ');
      const message = detail ? `${error.message} [${detail}]` : error.message;
      console.warn('Microsoft→Supabase session link failed:', message);
      recordServerSessionLinkFailure('microsoft', message);
      return null;
    }
    clearServerSessionLinkFailure();
    return data.user?.id ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Microsoft→Supabase session link failed:', message);
    recordServerSessionLinkFailure('microsoft', message);
    return null;
  }
}

export class MicrosoftAuthProvider {
  async isAvailable(): Promise<boolean> {
    return ipc.authIsMicrosoftSignInConfigured();
  }

  async signIn(): Promise<AuthUser> {
    try {
      const { profile, idToken, accessToken } = await ipc.authStartMicrosoftSignIn();
      const supabaseUserId = await linkSupabaseSession(idToken, accessToken);
      if (!supabaseUserId) {
        const reason = getServerSessionLinkFailure()?.message;
        throw new Error(
          `Microsoft sign-in worked, but PawOS could not connect it to your account${reason ? ` (server said: ${reason})` : ''}. Please try again in a moment, or sign in with email or GitHub.`
        );
      }
      return toAuthUser(profile, supabaseUserId);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
