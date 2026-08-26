import * as http from 'http';
import { shell } from 'electron';

export type MicrosoftOAuthConfig = {
  clientId: string;
  /** Must exactly match a redirect URI registered in Azure App Registration — the hosted pawos-web route (e.g. https://pawos.revantaai.com/auth/microsoft/callback), which redirects the browser to a local loopback URL on this machine (see LOCAL_CALLBACK_PORT below). */
  redirectUri: string;
  tenantId: string;
};

/**
 * Fixed loopback port this process listens on during a sign-in attempt — the same pattern
 * GoogleOAuthFlow uses (RFC 8252 "OAuth for Native Apps"). pawos-web's callback route redirects
 * the browser to http://127.0.0.1:LOCAL_CALLBACK_PORT/callback; since the browser and this
 * process are on the same machine, that navigation always succeeds as a plain HTTP request.
 */
const LOCAL_CALLBACK_PORT = 51899;

/**
 * Microsoft sign-in: Authorization Code flow. Identical pattern to GoogleOAuthFlow.
 *
 * The code-for-token exchange (the one step that needs MICROSOFT_CLIENT_SECRET)
 * happens server-side in pawos-web's own callback route (see
 * pawos-web/src/lib/desktopRelay.ts's relayMicrosoftToDesktop) — that secret
 * lives in the server's own environment and is never bundled into this
 * installer. The finished tokens are stashed server-side under a short-lived
 * single-use ref (see microsoftAuthRelayStore.ts); pawos-web redirects the
 * browser to this process's local HTTP listener with just that ref, and this
 * function fetches the real payload itself via /api/auth/microsoft/consume.
 *
 * Opens the system browser (shell.openExternal), starts a local HTTP server
 * on LOCAL_CALLBACK_PORT, waits for the browser to be redirected there.
 * Requires MICROSOFT_CLIENT_ID/MICROSOFT_REDIRECT_URI and MICROSOFT_TENANT_ID
 * — all ship with safe public defaults (see publicEnvDefaults.ts), so this
 * works out of the box.
 *
 * Microsoft's token endpoint already returns a real id_token (with 'openid'
 * scope), which the renderer uses to bridge into a real Supabase session via
 * supabase.auth.signInWithIdToken() with provider: 'azure'.
 */
export async function startMicrosoftSignIn(config: MicrosoftOAuthConfig): Promise<{ profile: any; idToken: string; accessToken: string }> {
  const { clientId, redirectUri, tenantId } = config;

  const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_CALLBACK_PORT, '127.0.0.1', () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in relay on port ${LOCAL_CALLBACK_PORT} (${err instanceof Error ? err.message : err}). Is another PawOS sign-in already in progress?`
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  clearTimeout(timeoutHandle);
  const resultPromise = new Promise<{ profile: any; idToken: string; accessToken: string }>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      server.close();
      fn();
    };

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('Microsoft sign-in timed out.'))), 120000);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${LOCAL_CALLBACK_PORT}`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;text-align:center;padding:48px"><p>Signed in successfully.</p><p style="color:#666;font-size:14px">You can close this tab and return to PawOS.</p></body></html>'
      );

      const error = url.searchParams.get('error');
      if (error) {
        finish(() => reject(new Error(error)));
        return;
      }
      const ref = url.searchParams.get('ref');
      if (!ref) {
        finish(() => reject(new Error('Microsoft sign-in callback was missing its handoff reference.')));
        return;
      }

      fetch(`https://pawos.revantaai.com/api/auth/microsoft/consume?ref=${encodeURIComponent(ref)}`)
        .then(async (consumeRes) => {
          if (!consumeRes.ok) {
            finish(() => reject(new Error(`Microsoft sign-in handoff could not be completed (HTTP ${consumeRes.status}).`)));
            return;
          }
          const payload = (await consumeRes.json()) as {
            idToken?: string;
            accessToken?: string;
            profile?: { id?: string; mail?: string; displayName?: string };
          };
          if (!payload.idToken || !payload.accessToken || !payload.profile?.id || !payload.profile?.mail) {
            finish(() => reject(new Error('Microsoft sign-in handoff response was missing required fields.')));
            return;
          }
          finish(() => resolve({
            profile: payload.profile,
            idToken: payload.idToken as string,
            accessToken: payload.accessToken as string,
          }));
        })
        .catch((e) => finish(() => reject(e instanceof Error ? e : new Error('Microsoft sign-in handoff request failed.'))));
    });
  });

  try {
    await shell.openExternal(authUrl.toString());
  } catch (e) {
    clearTimeout(timeoutHandle);
    server.close();
    throw e;
  }

  return resultPromise;
}
