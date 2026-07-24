import * as http from 'http';
import { shell } from 'electron';

export type GitHubOAuthCallbackResult = { code: string };

/**
 * Fixed local port pawos-web's hosted /auth/github/callback route relays
 * the code to — see the matching constant/comment in GoogleOAuthFlow.ts for
 * why this is a public hosted URL + local relay rather than a bare loopback
 * URL registered directly with the provider.
 */
const LOCAL_RELAY_PORT = 51898;
const LOCAL_RELAY_PATH = '/relay';

/**
 * Unlike GoogleOAuthFlow.ts, this does NOT talk to GitHub's token endpoint
 * directly — GitHub's OAuth is plain OAuth2, not OIDC, so it never returns
 * an id_token, and there is no supabase.auth.signInWithIdToken() bridge for
 * it. Instead, Supabase itself acts as the OAuth client (using the Client
 * ID/Secret configured in the Supabase dashboard's GitHub provider — see
 * project docs) and does the whole GitHub exchange server-side.
 *
 * The renderer calls supabase.auth.signInWithOAuth({ provider: 'github' })
 * to get Supabase's own authorize URL, then hands it to this function. This
 * function opens that URL in the system browser and waits on a local relay
 * server (LOCAL_RELAY_PORT) for pawos-web's hosted /auth/github/callback
 * route to forward Supabase's final redirect to it — GITHUB_REDIRECT_URI
 * (that hosted URL, registered in Supabase's project "Redirect URLs"
 * allowlist) is what Supabase actually redirects the browser to; this
 * process never binds to it directly. That redirect carries a PKCE `code`
 * query param, which the renderer then exchanges for a real session via
 * supabase.auth.exchangeCodeForSession() — using the SAME client instance
 * that started the flow, since the PKCE code_verifier lives in that
 * client's local storage.
 */
export async function waitForGitHubOAuthCallback(redirectUri: string, authorizeUrl: string): Promise<GitHubOAuthCallbackResult> {
  void redirectUri; // kept in the signature for callers/logging context; binding now always targets LOCAL_RELAY_PORT below.

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_RELAY_PORT, '127.0.0.1', () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in relay on port ${LOCAL_RELAY_PORT} (${err instanceof Error ? err.message : err}). Is another PawOS sign-in already in progress?`
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const codePromise = new Promise<string>((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('GitHub sign-in timed out.')), 120000);
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${LOCAL_RELAY_PORT}`);
      if (url.pathname !== LOCAL_RELAY_PATH) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        error
          ? `<html><body style="font-family:sans-serif;padding:40px;">Sign-in failed: ${error}. You can close this window.</body></html>`
          : `<html><body style="font-family:sans-serif;padding:40px;">Signed in — you can close this window and return to PawOS.</body></html>`
      );
      if (error) reject(new Error(error));
      else if (code) resolve(code);
      else reject(new Error('GitHub sign-in callback was missing an authorization code.'));
    });
  });

  // Only open the browser once the server is already listening for the
  // redirect — opening it any later risks missing a very fast redirect.
  await shell.openExternal(authorizeUrl);

  const code = await codePromise.finally(() => {
    clearTimeout(timeoutHandle);
    server.close();
  });

  return { code };
}
