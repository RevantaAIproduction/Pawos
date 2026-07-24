import { randomBytes, createHash } from 'crypto';
import { shell } from 'electron';
import type { GoogleProfile, GoogleSignInResult } from '../../shared/auth/AccountTypes';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

export type { GoogleProfile, GoogleSignInResult };

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret?: string;
  /** Must exactly match a redirect URI registered on this OAuth client in Google Cloud Console — the hosted pawos-web route (e.g. https://pawos.revantaai.com/auth/google/callback), which redirects the browser into this app via the pawos:// custom protocol (see OAuthProtocolBridge.ts) rather than a loopback URL Google would redirect to directly. */
  redirectUri: string;
};

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
 * redirects the browser into this app via the pawos:// custom protocol
 * (see OAuthProtocolBridge.ts) rather than relaying to a local port — a
 * remote server has no network path to a port on this machine. The token
 * exchange still includes the client secret.
 *
 * Opens the system browser (shell.openExternal), waits for the OS to
 * deliver Google's code back via the pawos:// protocol, exchanges the code
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
    timeoutHandle = setTimeout(() => {
      unregisterPendingOAuth('google');
      reject(new Error('Google sign-in timed out.'));
    }, 120000);
    registerPendingOAuth('google', {
      resolve: (c) => {
        clearTimeout(timeoutHandle);
        resolve(c);
      },
      reject: (e) => {
        clearTimeout(timeoutHandle);
        reject(e);
      },
    });
  });

  // Registering the pending resolver before opening the browser avoids
  // missing a very fast redirect back into the app.
  await shell.openExternal(authUrl.toString());

  const code = await codePromise;

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
