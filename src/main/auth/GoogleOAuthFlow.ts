import * as http from 'http';
import { shell } from 'electron';
import type { GoogleProfile, GoogleSignInResult } from '../../shared/auth/AccountTypes';

export type { GoogleProfile, GoogleSignInResult };

export type GoogleOAuthConfig = {
  clientId: string;
  /** Must exactly match a redirect URI registered on this OAuth client in Google Cloud Console — the hosted pawos-web route (e.g. https://pawos.revantaai.com/auth/google/callback), which redirects the browser to a local loopback URL on this machine (see LOCAL_CALLBACK_PORT below) rather than a pawos:// custom protocol. */
  redirectUri: string;
};

/**
 * Fixed loopback port this process listens on during a sign-in attempt — the same pattern
 * Claude Desktop, Cursor, VS Code, and the gcloud/AWS CLIs use for OAuth (RFC 8252 "OAuth for
 * Native Apps"). pawos-web's callback route redirects the *browser* (not itself — a remote
 * server still can't reach this machine) to http://127.0.0.1:LOCAL_CALLBACK_PORT/callback; since
 * the browser and this process are on the same machine, that navigation always succeeds as a
 * plain HTTP request. No OS protocol registry, no ShellExecute handoff, no browser "open external
 * app?" dialog — which is what made the earlier pawos:// custom-protocol approach fragile
 * (confirmed live: Chromium's own abusive-external-app-redirect throttle silently swallowed
 * repeated pawos:// launches with no error and no dialog, independent of any app code).
 */
const LOCAL_CALLBACK_PORT = 51899;

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
 * installer. The finished tokens are stashed server-side under a short-lived
 * single-use ref (see googleAuthRelayStore.ts); pawos-web redirects the
 * browser to this process's local HTTP listener with just that ref, and this
 * function fetches the real payload itself via /api/auth/google/consume.
 *
 * Opens the system browser (shell.openExternal), starts a local HTTP server
 * on LOCAL_CALLBACK_PORT, waits for the browser to be redirected there.
 * Requires GOOGLE_CLIENT_ID/GOOGLE_REDIRECT_URI — both ship with safe public
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

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_CALLBACK_PORT, '127.0.0.1', () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in relay on port ${LOCAL_CALLBACK_PORT} (${err instanceof Error ? err.message : err}). Is another PawOS sign-in already in progress?`
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const resultPromise = new Promise<GoogleSignInResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      server.close();
      fn();
    };

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('Google sign-in timed out.'))), 120000);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${LOCAL_CALLBACK_PORT}`);
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
        finish(() => reject(new Error('Google sign-in callback was missing its handoff reference.')));
        return;
      }

      fetch(`https://pawos.revantaai.com/api/auth/google/consume?ref=${encodeURIComponent(ref)}`)
        .then(async (consumeRes) => {
          if (!consumeRes.ok) {
            finish(() => reject(new Error(`Google sign-in handoff could not be completed (HTTP ${consumeRes.status}).`)));
            return;
          }
          const payload = (await consumeRes.json()) as {
            idToken?: string;
            accessToken?: string;
            profile?: { sub?: string; email?: string; name?: string; picture?: string };
          };
          if (!payload.idToken || !payload.accessToken || !payload.profile?.sub || !payload.profile?.email) {
            finish(() => reject(new Error('Google sign-in handoff response was missing required fields.')));
            return;
          }
          const profile: GoogleProfile = {
            sub: payload.profile.sub,
            email: payload.profile.email,
            name: payload.profile.name ?? payload.profile.email,
            picture: payload.profile.picture,
          };
          finish(() => resolve({ profile, idToken: payload.idToken as string, accessToken: payload.accessToken as string }));
        })
        .catch((e) => finish(() => reject(e instanceof Error ? e : new Error('Google sign-in handoff request failed.'))));
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
