import { shell } from 'electron';
import { registerPendingOAuth, unregisterPendingOAuth } from './OAuthProtocolBridge';

export type GitHubOAuthCallbackResult = { code: string };

/**
 * Real GitHub sign-in via Supabase's own hosted OAuth.
 * The renderer calls supabase.auth.signInWithOAuth({ provider: 'github' }) to get
 * Supabase's own authorize URL and hands it to this function.
 *
 * This waits for the OS to deliver Supabase's final redirect back into this app via the
 * pawos:// custom protocol (see OAuthProtocolBridge.ts's PROTOCOL_HOST_TO_PROVIDER).
 *
 * That redirect carries a PKCE `code` query param, which the renderer then exchanges for a real
 * session via supabase.auth.exchangeCodeForSession() — using the SAME client instance that
 * started the flow, since the PKCE code_verifier lives in that client's local storage.
 */
export async function waitForGitHubOAuthCallback(redirectUri: string, authorizeUrl: string): Promise<GitHubOAuthCallbackResult> {
  void redirectUri; // Kept in signature for backward compatibility

  let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  clearTimeout(timeoutHandle);
  
  const resultPromise = new Promise<GitHubOAuthCallbackResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      unregisterPendingOAuth('github');
      fn();
    };

    registerPendingOAuth('github', {
      resolve: (code) => finish(() => resolve({ code })),
      reject: (err) => finish(() => reject(err)),
    });

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('GitHub sign-in timed out.'))), 120000);
  });

  try {
    await shell.openExternal(authorizeUrl);
  } catch (e) {
    clearTimeout(timeoutHandle);
    unregisterPendingOAuth('github');
    throw e;
  }

  return resultPromise;
}
