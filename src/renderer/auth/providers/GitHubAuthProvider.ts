import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.user_name === 'string' && meta.user_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    'GitHub User';
  const pictureUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined;
  return {
    id: user.id,
    name,
    email: user.email,
    pictureUrl,
    provider: 'github',
    isGuest: false,
    createdAt: Date.now(),
  };
}

/**
 * Real GitHub sign-in — unlike Google, this doesn't do its own OAuth
 * exchange in the main process: GitHub's OAuth2 has no id_token to bridge
 * with (it isn't OIDC), so there's no signInWithIdToken() equivalent.
 * Instead Supabase itself is the OAuth client (using the Client ID/Secret
 * configured in the Supabase project's GitHub provider settings) and does
 * the whole exchange server-side.
 *
 * Flow: ask this SAME Supabase client for its GitHub authorize URL
 * (skipBrowserRedirect — we're not in a web page Supabase can navigate),
 * hand that URL to the main process (src/main/auth/GitHubOAuthFlow.ts),
 * which opens it in the system browser and waits on a loopback server for
 * the final redirect back from Supabase (which carries a PKCE `code`), then
 * exchange that code for a real session using this same client instance —
 * the PKCE code_verifier from step one lives in this client's own local
 * storage, so a different client instance can't complete the exchange.
 */
export class GitHubAuthProvider {
  async isAvailable(): Promise<boolean> {
    return ipc.authIsGithubSignInConfigured();
  }

  async signIn(): Promise<AuthUser> {
    try {
      const supabase = await getSupabaseClient();
      const { githubRedirectUri } = await ipc.envGetApiKeys();
      if (!githubRedirectUri) {
        throw new Error('GitHub sign-in isn’t configured yet — add GITHUB_REDIRECT_URI to your .env.');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: githubRedirectUri, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        throw new Error(error?.message ?? 'Could not start GitHub sign-in.');
      }

      const { code } = await ipc.authStartGithubSignIn(data.url);

      const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError || !sessionData.user) {
        throw new Error(exchangeError?.message ?? 'GitHub sign-in did not return a valid session.');
      }

      return toAuthUser(sessionData.user);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
