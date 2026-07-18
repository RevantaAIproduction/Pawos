import { randomBytes, createHash } from 'crypto';
import * as http from 'http';
import { shell } from 'electron';
import type { GoogleProfile } from '../../shared/auth/AccountTypes';

export type { GoogleProfile };

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret?: string;
  /** Must exactly match a redirect URI registered on this OAuth client in Google Cloud Console — e.g. http://localhost:8000/auth/google/callback for local dev. */
  redirectUri: string;
};

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Real Google sign-in: Authorization Code flow (+ PKCE for defense in
 * depth) via a loopback HTTP server bound to the exact host/port/path of
 * the configured redirect URI — this client is registered as a "Web
 * application" type (it has a client secret), not a PKCE-only "Desktop
 * app" client, so the redirect URI must match one registered in Google
 * Cloud Console exactly (no dynamic port) and the token exchange includes
 * the client secret.
 *
 * Opens the system browser (shell.openExternal), waits for Google's
 * redirect to hit the local server, exchanges the code for tokens, then
 * fetches the profile. Requires GOOGLE_CLIENT_ID/GOOGLE_REDIRECT_URI (and
 * GOOGLE_CLIENT_SECRET, for this client type) in .env — there is no
 * fallback/fake profile if these aren't configured.
 */
export async function startGoogleSignIn(config: GoogleOAuthConfig): Promise<GoogleProfile> {
  const { clientId, clientSecret, redirectUri } = config;
  const parsedRedirect = new URL(redirectUri);
  const port = Number(parsedRedirect.port) || (parsedRedirect.protocol === 'https:' ? 443 : 80);
  const callbackPath = parsedRedirect.pathname;

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, parsedRedirect.hostname, () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in server on port ${port} (${err instanceof Error ? err.message : err}). Is something else already using it?`
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
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end();
        return;
      }
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
  const tokens = (await tokenResponse.json()) as { access_token: string };

  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw new Error(`Google profile fetch failed (${profileResponse.status}).`);
  return (await profileResponse.json()) as GoogleProfile;
}
