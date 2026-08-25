import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

interface MicrosoftProfile {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
  givenName?: string;
}

function toAuthUser(profile: MicrosoftProfile, supabaseUserId: string | null): AuthUser {
  return {
    id: supabaseUserId ?? `microsoft:${profile.id}`,
    name: profile.displayName || profile.givenName || profile.userPrincipalName.split('@')[0],
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
      console.warn('Microsoft→Supabase session link failed:', error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch (err) {
    console.warn('Microsoft→Supabase session link failed:', err instanceof Error ? err.message : err);
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
      return toAuthUser(profile, supabaseUserId);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
