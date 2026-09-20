import { shell } from 'electron';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';
import type { GoogleProfile, GoogleSignInResult } from '../../shared/auth/AccountTypes';

export type { GoogleProfile, GoogleSignInResult };

export type GoogleOAuthConfig = {
  clientId: string;
  redirectUri: string;
};

/**
 * Real Google sign-in: Authorization Code flow.
 *
 * The code-for-token exchange happens server-side. The finished tokens are stashed
 * server-side under a short-lived single-use ref. pawos-web redirects the browser
 * to pawos://google-auth-callback?ref=... and the OAuthProtocolBridge handles it.
 *
 * Opens the system browser (shell.openExternal), registers a pending resolver,
 * and waits for the OS to deliver the pawos:// url.
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

  let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  clearTimeout(timeoutHandle);
  
  const resultPromise = new Promise<GoogleSignInResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      unregisterPendingOAuth('google');
      fn();
    };

    registerPendingOAuth('google', {
      resolve: (payloadStr) => {
        try {
          const parsed = JSON.parse(payloadStr);
          finish(() => resolve(parsed as GoogleSignInResult));
        } catch (e) {
          finish(() => reject(new Error('Google sign-in handoff returned an invalid payload.')));
        }
      },
      reject: (err) => finish(() => reject(err)),
    });

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('Google sign-in timed out.'))), 120000);
  });

  try {
    await shell.openExternal(authUrl.toString());
  } catch (e) {
    clearTimeout(timeoutHandle);
    unregisterPendingOAuth('google');
    throw e;
  }

  return resultPromise;
}
