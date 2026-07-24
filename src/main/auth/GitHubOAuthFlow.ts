import { shell } from 'electron';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

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
 * function opens that URL in the system browser and waits for the OS to
 * deliver Supabase's final redirect back into this app via the pawos://
 * custom protocol (see OAuthProtocolBridge.ts) — pawos-web's hosted
 * /auth/github/callback route (registered in Supabase's project "Redirect
 * URLs" allowlist) is what Supabase actually redirects the browser to; this
 * process never binds to any port directly, since a remote server has no
 * network path to one on this machine. That redirect carries a PKCE `code`
 * query param, which the renderer then exchanges for a real session via
 * supabase.auth.exchangeCodeForSession() — using the SAME client instance
 * that started the flow, since the PKCE code_verifier lives in that
 * client's local storage.
 */
export async function waitForGitHubOAuthCallback(redirectUri: string, authorizeUrl: string): Promise<GitHubOAuthCallbackResult> {
  void redirectUri; // kept in the signature for callers/logging context; delivery now always goes through the pawos:// protocol below.

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const codePromise = new Promise<string>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      unregisterPendingOAuth('github');
      reject(new Error('GitHub sign-in timed out.'));
    }, 120000);
    registerPendingOAuth('github', {
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
  await shell.openExternal(authorizeUrl);

  const code = await codePromise;
  return { code };
}
