import * as http from 'http';
import { shell } from 'electron';

export type GitHubOAuthCallbackResult = { code: string };

/**
 * Fixed loopback port this process listens on during a sign-in attempt — the same port and
 * pattern GoogleOAuthFlow.ts already uses (RFC 8252 "OAuth for Native Apps", same as Claude
 * Desktop/Cursor/VS Code/gcloud). Only one PawOS sign-in can be in flight at a time (whichever
 * flow calls listen() first on this port wins; the other fails fast with a clear "already in
 * progress" error) — deliberately shared with Google's flow rather than a second port, since a
 * user only ever runs one sign-in at once.
 */
const LOCAL_CALLBACK_PORT = 51899;

/**
 * Real GitHub sign-in via Supabase's own hosted OAuth (GitHub's OAuth2 has no id_token to bridge
 * with, unlike Google — Supabase itself acts as the OAuth client and does the whole GitHub
 * exchange server-side using the Client ID/Secret configured in the Supabase dashboard's GitHub
 * provider). The renderer calls supabase.auth.signInWithOAuth({ provider: 'github' }) to get
 * Supabase's own authorize URL and hands it to this function.
 *
 * This used to wait for the OS to deliver Supabase's final redirect back into this app via the
 * pawos:// custom protocol (see OAuthProtocolBridge.ts's PROTOCOL_HOST_TO_PROVIDER, still
 * present for backward compatibility but no longer used by this flow) — confirmed unreliable in
 * production ("GitHub sign-in not responding"): Chromium/Edge/Firefox silently throttle a
 * script-driven navigation to a custom protocol scheme when it doesn't look like a fresh,
 * direct user gesture, which a full OAuth round-trip redirect chain never does, even though the
 * whole flow started from a real click. No error, no dialog — the browser tab just sits there
 * forever, which is exactly what "not responding" describes. GoogleOAuthFlow.ts already solved
 * this identical problem by switching to a same-machine loopback HTTP redirect instead of a
 * custom protocol — this mirrors that same fix for GitHub. pawos-web's
 * /auth/github/callback route now redirects the browser here (http://127.0.0.1:51899/callback)
 * instead of to pawos://github-auth-callback; no Supabase dashboard change is needed, since the
 * hosted callback URL Supabase itself redirects to is unchanged — only what that page does next.
 *
 * That redirect carries a PKCE `code` query param, which the renderer then exchanges for a real
 * session via supabase.auth.exchangeCodeForSession() — using the SAME client instance that
 * started the flow, since the PKCE code_verifier lives in that client's local storage.
 */
export async function waitForGitHubOAuthCallback(redirectUri: string, authorizeUrl: string): Promise<GitHubOAuthCallbackResult> {
  void redirectUri; // kept in the signature for callers/logging context — delivery goes through the local loopback listener below.

  const server = http.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(LOCAL_CALLBACK_PORT, '127.0.0.1', () => resolve());
  }).catch((err) => {
    throw new Error(
      `Couldn't start the local sign-in relay on port ${LOCAL_CALLBACK_PORT} (${err instanceof Error ? err.message : err}). Is another PawOS sign-in already in progress?`
    );
  });

  let timeoutHandle: ReturnType<typeof setTimeout> = setTimeout(() => {}, 0);
  clearTimeout(timeoutHandle);
  const resultPromise = new Promise<GitHubOAuthCallbackResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      server.close();
      fn();
    };

    timeoutHandle = setTimeout(() => finish(() => reject(new Error('GitHub sign-in timed out.'))), 120000);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${LOCAL_CALLBACK_PORT}`);

      // Browsers routinely fire an automatic /favicon.ico request (and similar probes) against
      // any origin they land on — filtering by path avoids treating that as the real callback
      // (see GoogleOAuthFlow.ts's identical guard for the same confirmed-live race).
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<html><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;text-align:center;padding:48px"><p>Signed in successfully.</p><p style="color:#666;font-size:14px">You can close this tab and return to PawOS.</p></body></html>'
      );

      const error = url.searchParams.get('error');
      if (error) {
        finish(() => reject(new Error(error)));
        return;
      }
      const code = url.searchParams.get('code');
      if (!code) {
        finish(() => reject(new Error('GitHub sign-in callback was missing an authorization code.')));
        return;
      }
      finish(() => resolve({ code }));
    });
  });

  try {
    await shell.openExternal(authorizeUrl);
  } catch (e) {
    clearTimeout(timeoutHandle);
    server.close();
    throw e;
  }

  return resultPromise;
}
