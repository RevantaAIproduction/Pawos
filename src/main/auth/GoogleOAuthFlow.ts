import { shell } from 'electron';
import type { GoogleProfile, GoogleSignInResult } from '../../shared/auth/AccountTypes';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

export type { GoogleProfile, GoogleSignInResult };

export type GoogleOAuthConfig = {
  clientId: string;
  /** Must exactly match a redirect URI registered on this OAuth client in Google Cloud Console — the hosted pawos-web route (e.g. https://pawos.revantaai.com/auth/google/callback), which redirects the browser into this app via the pawos:// custom protocol (see OAuthProtocolBridge.ts) rather than a loopback URL Google would redirect to directly. */
  redirectUri: string;
};

/**
 * Real Google sign-in: Authorization Code flow. This client is registered as
 * a "Web application" type (it has a client secret), so `redirectUri` must
 * match one registered in Google Cloud Console exactly — that's pawos-web's
 * hosted /auth/google/callback route, not a loopback URL, so Google always
 * has somewhere real to redirect the system browser to regardless of this
 * process's local network state.
 *
 * The code-for-token exchange (the one step that needs GOOGLE_CLIENT_SECRET)
 * happens server-side in pawos-web's own callback route (see
 * pawos-web/src/lib/desktopRelay.ts's relayGoogleToDesktop) — that secret
 * lives in the server's own environment and is never bundled into this
 * installer. pawos-web redirects the browser into this app via pawos://
 * carrying the already-exchanged id_token/access_token/profile fields, so
 * this function only needs the (non-secret) client ID and redirect URI to
 * build the initial authorize URL.
 *
 * Opens the system browser (shell.openExternal), waits for the OS to
 * deliver the result back via the pawos:// protocol. Requires
 * GOOGLE_CLIENT_ID/GOOGLE_REDIRECT_URI — both ship with safe public
 * defaults (see publicEnvDefaults.ts), so this works out of the box.
 *
 * Google's token endpoint already returns a real id_token (see
 * relayGoogleToDesktop's 'openid' scope), which the renderer uses to bridge
 * into a real Supabase session via supabase.auth.signInWithIdToken() — every
 * Supabase-backed feature (Organizations, RLS) requires it. Without this, a
 * Google-signed-in PawOS user is fully authenticated locally but invisible
 * to Supabase.
 */
export async function startGoogleSignIn(config: GoogleOAuthConfig): Promise<GoogleSignInResult> {
  const { clientId, redirectUri } = config;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const payloadPromise = new Promise<string>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      unregisterPendingOAuth('google');
      reject(new Error('Google sign-in timed out.'));
    }, 120000);
    registerPendingOAuth('google', {
      resolve: (p) => {
        clearTimeout(timeoutHandle);
        resolve(p);
      },
      reject: (e) => {
        clearTimeout(timeoutHandle);
        reject(e);
      },
    });
  });

  // Registering the pending resolver before opening the browser avoids
  // missing a very fast redirect back into the app.
  console.log('[GoogleOAuthFlow] opening system browser for:', authUrl.toString());
  try {
    await shell.openExternal(authUrl.toString());
    console.log('[GoogleOAuthFlow] shell.openExternal resolved without throwing');
  } catch (e) {
    console.error('[GoogleOAuthFlow] shell.openExternal threw:', e);
    unregisterPendingOAuth('google');
    clearTimeout(timeoutHandle);
    throw e;
  }

  const payload = await payloadPromise;
  const { idToken, accessToken, profile } = JSON.parse(payload) as {
    idToken: string;
    accessToken: string;
    profile: GoogleProfile;
  };
  return { profile, idToken, accessToken };
}
