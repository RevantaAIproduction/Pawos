import { ipc } from '../../services/ipc/ipcBridgeImplementation';
import { getSupabaseClient } from '../supabaseClient';
import type { AuthUser } from '../AuthTypes';
import { cleanIpcErrorMessage } from '../ipcErrorMessage';

function toAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Google User';
  const pictureUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) || (typeof meta.picture === 'string' && meta.picture) || undefined;
  return {
    // The PawOS server account id — the same one email and GitHub sign-in give for this email
    // (Supabase links identities that share a verified email). Never a local-only id.
    id: user.id,
    name,
    email: user.email,
    pictureUrl,
    provider: 'google',
    isGuest: false,
    createdAt: Date.now(),
  };
}

/**
 * Real Google sign-in, run by Supabase itself — the same route as GitHub sign-in
 * (GitHubAuthProvider.ts) and the website's Google login. Supabase is the OAuth client (the Google
 * provider's Client ID/Secret in the Supabase project), so the result is always a real Supabase
 * session: one PawOS account id across Google, GitHub and email.
 *
 * (Desktop Google sign-in used to exchange Google's code itself and hand the id_token to Supabase
 * via signInWithIdToken. Supabase's id_token check rejects it ("Internal Server Error", HTTP 400),
 * and the app used to hide that by signing in with a local-only account — which had no plan, Build
 * access, credits or Ticket Balance.)
 *
 * Flow: ask this Supabase client for its Google authorize URL (skipBrowserRedirect), hand it to the
 * main process, which opens it in the system browser and waits for pawos-web to relay Supabase's
 * PKCE `code` back (via the same GITHUB_REDIRECT_URI relay route GitHub uses — it carries any
 * Supabase OAuth code), then exchange that code on this same client (its PKCE verifier lives here).
 */
export class GoogleAuthProvider {
  async isAvailable(): Promise<boolean> {
    return ipc.authIsGithubSignInConfigured();
  }

  async signIn(): Promise<AuthUser> {
    try {
      const supabase = await getSupabaseClient();
      const { githubRedirectUri } = await ipc.envGetApiKeys();
      if (!githubRedirectUri) {
        throw new Error('Google sign-in isn’t configured yet — add GITHUB_REDIRECT_URI to your .env.');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: githubRedirectUri, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error || !data.url) {
        throw new Error(error?.message ?? 'Could not start Google sign-in.');
      }

      const { code } = await ipc.authStartGithubSignIn(data.url);

      const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError || !sessionData.user) {
        throw new Error(exchangeError?.message ?? 'Google sign-in did not return a valid session.');
      }

      return toAuthUser(sessionData.user);
    } catch (err) {
      throw new Error(cleanIpcErrorMessage(err));
    }
  }
}
