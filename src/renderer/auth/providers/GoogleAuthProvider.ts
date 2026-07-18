import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import type { GoogleProfile } from '../../../shared/auth/AccountTypes';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

function toAuthUser(profile: GoogleProfile): AuthUser {
  return {
    id: `google:${profile.sub}`,
    name: profile.name,
    email: profile.email,
    pictureUrl: profile.picture,
    provider: 'google',
    isGuest: false,
    createdAt: Date.now(),
  };
}

/**
 * Real Google OAuth (Authorization Code + PKCE via a loopback server — see
 * src/main/auth/GoogleOAuthFlow.ts) — the actual browser/token exchange
 * happens in the main process; this class only shapes the returned profile
 * into an AuthUser. Requires GOOGLE_CLIENT_ID in .env; isAvailable() lets
 * the UI show an honest "not configured yet" state instead of a button
 * that fails silently.
 */
export class GoogleAuthProvider {
  async isAvailable(): Promise<boolean> {
    return ipc.authIsGoogleSignInConfigured();
  }

  async signIn(): Promise<AuthUser> {
    try {
      const profile = await ipc.authStartGoogleSignIn();
      return toAuthUser(profile);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
