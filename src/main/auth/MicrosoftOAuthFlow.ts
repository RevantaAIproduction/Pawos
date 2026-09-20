import { shell } from 'electron';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

export type MicrosoftOAuthConfig = {
  clientId: string;
  redirectUri: string;
  tenantId: string;
};

/**
 * Microsoft sign-in: Authorization Code flow. Identical pattern to GoogleOAuthFlow.
 *
 * The code-for-token exchange happens server-side. The finished tokens are stashed
 * server-side under a short-lived single-use ref. pawos-web redirects the browser
 * to pawos://microsoft-auth-callback?ref=... and the OAuthProtocolBridge handles it.
 *
 * Opens the system browser (shell.openExternal), registers a pending resolver,
 * and waits for the OS to deliver the pawos:// url.
 */
export async function startMicrosoftSignIn(config: MicrosoftOAuthConfig): Promise<{ profile: any; idToken: string; accessToken: string }> {
  const { clientId, redirectUri, tenantId } = config;

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');

  let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  clearTimeout(timeoutHandle);
  
  const resultPromise = new Promise<{ profile: any; idToken: string; accessToken: string }>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      unregisterPendingOAuth('microsoft');
      fn();
    };

    registerPendingOAuth('microsoft', {
      resolve: (payloadStr) => {
        try {
          const parsed = JSON.parse(payloadStr);
          finish(() => resolve(parsed as { profile: any; idToken: string; accessToken: string }));
        } catch (e) {
          finish(() => reject(new Error('Microsoft sign-in handoff returned an invalid payload.')));
        }
      },
      reject: (err) => finish(() => reject(err)),
    });

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('Microsoft sign-in timed out.'))), 120000);
  });

  try {
    await shell.openExternal(authUrl.toString());
  } catch (e) {
    clearTimeout(timeoutHandle);
    unregisterPendingOAuth('microsoft');
    throw e;
  }

  return resultPromise;
}
