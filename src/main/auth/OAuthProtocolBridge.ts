/**
 * Replaces the old "server fetches http://127.0.0.1:PORT" relay design,
 * which only ever worked when pawos-web's dev server and this Electron app
 * ran on the same machine — once pawos-web moved to a real remote host, a
 * server process can never reach a port on the user's own computer over the
 * network. Custom URL protocols are the standard fix: the browser itself
 * hands the code to whichever app registered as the `pawos://` handler on
 * this machine, no network hop back to localhost required.
 *
 * pawos-web's /auth/google/callback and /auth/github/callback routes now
 * redirect the browser to pawos://google-auth-callback?code=... /
 * pawos://github-auth-callback?code=... instead of relaying to a local port.
 * main.ts wires OS-level delivery of that URL (open-url on macOS,
 * second-instance argv on Windows/Linux) into handleOAuthProtocolUrl below.
 */

export type OAuthProvider = 'google' | 'github';

type PendingResolver = { resolve: (code: string) => void; reject: (error: Error) => void };

const pending = new Map<OAuthProvider, PendingResolver>();

/** Called by GoogleOAuthFlow.ts/GitHubOAuthFlow.ts before opening the system browser. */
export function registerPendingOAuth(provider: OAuthProvider, resolver: PendingResolver): void {
  pending.set(provider, resolver);
}

/** Called by whichever flow's own timeout fires, so a stale resolver never answers a later, unrelated sign-in. */
export function unregisterPendingOAuth(provider: OAuthProvider): void {
  pending.delete(provider);
}

const PROTOCOL_HOST_TO_PROVIDER: Record<string, OAuthProvider> = {
  'google-auth-callback': 'google',
  'github-auth-callback': 'github',
};

/**
 * Separate, additive hook for the Connectivity Runtime's own OAuth flow
 * (`pawos://connectivity-oauth-callback` — see `connectivity/OAuthManager.ts`).
 * This is intentionally NOT the `pending`/`PROTOCOL_HOST_TO_PROVIDER` map
 * above, which exists solely for PawOS's own Google/GitHub sign-in — kept
 * as a separate callback registration so the sign-in flow's dispatch code
 * above is never read, written, or branched on behalf of connector OAuth.
 */
let connectivityOAuthHandler: ((url: URL) => void) | null = null;

/** Called once by OAuthManager.ts to receive connectivity-oauth-callback deliveries. */
export function registerConnectivityOAuthHandler(handler: (url: URL) => void): void {
  connectivityOAuthHandler = handler;
}

/**
 * Called from main.ts with the raw pawos:// URL, from whichever OS mechanism
 * delivered it. Never logs `rawUrl` itself — for Google it carries a live
 * id_token/access_token in the query string, so even a debug log line here
 * would leak a real credential into disk/console output.
 */
export function handleOAuthProtocolUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return;
  }
  if (parsed.protocol !== 'pawos:') return;

  if (parsed.hostname === 'connectivity-oauth-callback') {
    if (connectivityOAuthHandler) connectivityOAuthHandler(parsed);
    return;
  }

  const provider = PROTOCOL_HOST_TO_PROVIDER[parsed.hostname];
  if (!provider) return;

  const resolver = pending.get(provider);
  if (!resolver) return;
  pending.delete(provider);

  const error = parsed.searchParams.get('error_description') ?? parsed.searchParams.get('error');
  if (error) {
    resolver.reject(new Error(error));
    return;
  }

  if (provider === 'google') {
    // pawos-web's callback already exchanged the code for tokens
    // server-side (see relayGoogleToDesktop) — this app never sees a raw
    // authorization code or the client secret, only the finished result.
    const idToken = parsed.searchParams.get('id_token');
    const accessToken = parsed.searchParams.get('access_token');
    const sub = parsed.searchParams.get('sub');
    const email = parsed.searchParams.get('email');
    if (!idToken || !accessToken || !sub || !email) {
      resolver.reject(new Error('Google sign-in callback was missing required fields.'));
      return;
    }
    const name = parsed.searchParams.get('name');
    const picture = parsed.searchParams.get('picture');
    resolver.resolve(
      JSON.stringify({
        idToken,
        accessToken,
        profile: { sub, email, name: name ?? email, picture: picture ?? undefined },
      })
    );
    return;
  }

  const code = parsed.searchParams.get('code');
  if (code) resolver.resolve(code);
  else resolver.reject(new Error('Sign-in callback was missing an authorization code.'));
}

/** Scans process.argv for a pawos:// URL — needed on Windows/Linux where a cold-start via protocol click passes the URL as a CLI arg rather than firing open-url. */
export function extractProtocolUrlFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith('pawos://')) ?? null;
}
