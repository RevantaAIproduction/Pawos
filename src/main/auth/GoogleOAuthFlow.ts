import { randomBytes, createHash } from 'crypto';
import * as http from 'http';
import { shell } from 'electron';
import type { GoogleProfile, GoogleSignInResult } from '../../shared/auth/AccountTypes';

export type { GoogleProfile, GoogleSignInResult };

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret?: string;
  /** Must exactly match a redirect URI registered on this OAuth client in Google Cloud Console — now the hosted pawos-web route (e.g. https://pawos.revantaai.com/auth/google/callback), which relays the code back to this process (see LOCAL_RELAY_PORT below) rather than a loopback URL Google would redirect to directly. */
  redirectUri: string;
};

/**
 * Google (and GitHub's) OAuth apps are registered with a public, hosted
 * redirect URI (pawos-web's /auth/google/callback) rather than a bare
 * loopback URL — a public HTTPS URL is what OAuth providers expect, and it
 * lets the browser complete the redirect even if this desktop process's
 * dynamic port isn't reachable from wherever the system browser runs.
 * pawos-web's callback route (src/app/auth/google/callback/route.ts) relays
 * the resulting `code` to this fixed local port so this process — the one
 * that actually holds the PKCE verifier / does the token exchange — can
 * pick it up. Fixed (not OS-assigned) so the hosted route has something
 * stable to target.
 */
const LOCAL_RELAY_PORT = 51899;
const LOCAL_RELAY_PATH = '/relay';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Real Google sign-in: Authorization Code flow (+ PKCE for defense in
 * depth). This client is registered as a "Web application" type (it has a
 * client secret), not a PKCE-only "Desktop app" client, so `redirectUri`
 * must match one registered in Google Cloud Console exactly — that's now
 * pawos-web's hosted /auth/google/callback route, not a loopback URL, so
 * Google always has somewhere real to redirect the system browser to
 * regardless of this process's local network state. That hosted route
 * relays the resulting code back to LOCAL_RELAY_PORT above, which is what
 * this function actually listens on. The token exchange still includes
 * the client secret.
 *
 * Opens the system browser (shell.openExternal), waits for the hosted
 * callback to relay Google's code to the local server, exchanges the code
 * for tokens, then fetches the profile. Requires GOOGLE_CLIENT_ID/
 * GOOGLE_REDIRECT_URI (and GOOGLE_CLIENT_SECRET, for this client type) in
 * .env — there is no fallback/fake profile if these aren't configured.
 *
 * The authorize request already includes the 'openid' scope, so Google's
 * token endpoint already returns a real id_token alongside the access
 * token — this function now returns it (see GoogleSignInResult) so the
 * renderer can bridge into a real Supabase session via
 * supabase.auth.signInWithIdToken(), which every Supabase-backed feature
 * (Organizations, RLS) requires. Without this, a Google-signed-in PawOS
 * user is fully authenticated locally but invisible to Supabase.
 */
export async function startGoogleSignIn(config: GoogleOAuthConfig): Promise<GoogleSignInResult> {
  const { clientId, clientSecret, redirectUri } = config;

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_RELAY_PORT, '127.0.0.1', () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in relay on port ${LOCAL_RELAY_PORT} (${err instanceof Error ? err.message : err}). Is another PawOS sign-in already in progress?`
    );
  });

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('access_type', 'online');
  authUrl.searchParams.set('prompt', 'select_account');

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const codePromise = new Promise<string>((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Google sign-in timed out.')), 120000);
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${LOCAL_RELAY_PORT}`);
      if (url.pathname !== LOCAL_RELAY_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        error
          ? `<html><body style="font-family:sans-serif;padding:40px;">Sign-in failed: ${error}. You can close this window.</body></html>`
          : `<html><body style="font-family:sans-serif;padding:40px;">Signed in — you can close this window and return to PawOS.</body></html>`
      );
      if (error) reject(new Error(error));
      else if (authCode) resolve(authCode);
    });
  });

  // Only open the browser once the server is already listening for the
  // redirect — opening it any later risks missing a very fast redirect.
  await shell.openExternal(authUrl.toString());

  const code = await codePromise.finally(() => {
    clearTimeout(timeoutHandle);
    server.close();
  });

  const tokenBody: Record<string, string> = {
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  };
  if (clientSecret) tokenBody.client_secret = clientSecret;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(tokenBody),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`);
  }
  const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };
  if (!tokens.id_token) {
    // Shouldn't happen given the 'openid' scope above, but fail loudly
    // rather than silently skipping the Supabase bridge.
    throw new Error('Google did not return an ID token — sign-in cannot be linked to a cloud session.');
  }

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw new Error(`Google profile fetch failed (${profileResponse.status}).`);
  const profile = (await profileResponse.json()) as GoogleProfile;
  return { profile, idToken: tokens.id_token, accessToken: tokens.access_token };
}
