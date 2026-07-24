import * as http from 'http';
import { shell } from 'electron';

export type GitHubOAuthCallbackResult = { code: string };

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
 * function opens that URL in the system browser and waits on a loopback
 * server bound to the exact host/port/path of GITHUB_REDIRECT_URI (which
 * must also be registered in Supabase's project "Redirect URLs" allowlist)
 * for the final redirect Supabase sends back after completing the GitHub
 * exchange. That redirect carries a PKCE `code` query param, which the
 * renderer then exchanges for a real session via
 * supabase.auth.exchangeCodeForSession() — using the SAME client instance
 * that started the flow, since the PKCE code_verifier lives in that
 * client's local storage.
 */
export async function waitForGitHubOAuthCallback(redirectUri: string, authorizeUrl: string): Promise<GitHubOAuthCallbackResult> {
  const parsedRedirect = new URL(redirectUri);
  const port = Number(parsedRedirect.port) || (parsedRedirect.protocol === 'https:' ? 443 : 80);
  const callbackPath = parsedRedirect.pathname;

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, parsedRedirect.hostname, () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in server on port ${port} (${err instanceof Error ? err.message : err}). Is something else already using it?`
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const codePromise = new Promise<string>((resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('GitHub sign-in timed out.')), 120000);
    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', redirectUri);
      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end();
        return;
      }
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
