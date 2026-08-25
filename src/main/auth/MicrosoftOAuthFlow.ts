import http from 'http';
import { URL } from 'url';
import { shell } from 'electron';
import crypto from 'crypto';

const MICROSOFT_AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const MICROSOFT_GRAPH_URL = 'https://graph.microsoft.com/v1.0/me';

interface MicrosoftProfile {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
  givenName?: string;
}

export async function startMicrosoftOAuthFlow(
  clientId: string,
  clientSecret: string,
  tenantId: string
): Promise<{ profile: MicrosoftProfile; idToken: string; accessToken: string }> {
  const redirectUri = 'http://localhost:3389/callback';
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const authorizeUrl = new URL(MICROSOFT_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', codeChallenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('tenant', tenantId);

  const server = http.createServer();
  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Microsoft OAuth timeout'));
    }, 300000);

    server.on('request', (req, res) => {
      clearTimeout(timeout);
      const url = new URL(req.url || '', redirectUri);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (returnedState !== state) {
        res.writeHead(400);
        res.end('State mismatch');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }

      if (!code) {
        res.writeHead(400);
        res.end('No authorization code');
        server.close();
        reject(new Error('No authorization code from Microsoft'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Success!</h1><p>You can close this window.</p></body></html>');
      server.close();
      resolve(code);
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  server.listen(3389);

  // Open browser for user to complete sign-in
  shell.openExternal(authorizeUrl.toString());

  // Wait for authorization code
  const code = await codePromise;

  // Exchange code for tokens
  const tokenResponse = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json() as {
    access_token: string;
    id_token: string;
    error?: string;
  };

  if (tokenData.error) {
    throw new Error(`Microsoft OAuth error: ${tokenData.error}`);
  }

  // Fetch user profile from Microsoft Graph
  const profileResponse = await fetch(MICROSOFT_GRAPH_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileResponse.ok) {
    throw new Error(`Failed to fetch Microsoft profile: ${profileResponse.statusText}`);
  }

  const profile = (await profileResponse.json()) as MicrosoftProfile;

  return {
    profile,
    idToken: tokenData.id_token,
    accessToken: tokenData.access_token,
  };
}
