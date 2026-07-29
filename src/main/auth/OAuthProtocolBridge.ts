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

/** Matches pawos-web's CONNECTIVITY_OAUTH_BACKEND_BASE_URL (see OAuthManager.ts) — the same
 *  hosted origin, used here to fetch the short-lived Google sign-in payload by ref. */
const PAWOS_WEB_BASE_URL = 'https://pawos.revantaai.com';

/**
 * Called from main.ts with the raw pawos:// URL, from whichever OS mechanism delivered it. Never
 * logs `rawUrl` itself — even the `ref` param is a single-use credential-fetch capability, not
 * something to leave in disk/console output.
 *
 * Async because the 'google' branch makes one follow-up fetch (see below) — every caller (the
 * 'second-instance'/'open-url' event handlers and the cold-start argv check in main.ts) already
 * treats this as fire-and-forget, so returning a Promise instead of void is a non-breaking change.
 */
export async function handleOAuthProtocolUrl(rawUrl: string): Promise<void> {
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
    // pawos-web already exchanged the code for tokens server-side (see relayGoogleToDesktop) —
    // this app never sees a raw authorization code or the client secret. The finished
    // id_token/access_token/profile aren't in this URL either (real Google tokens are long
    // enough that embedding them here made the pawos:// deep link silently undeliverable —
    // confirmed live) — only a short single-use `ref` is, and this fetch trades it in once for
    // the real payload. See pawos-web/src/lib/googleAuthRelayStore.ts's doc comment.
    const ref = parsed.searchParams.get('ref');
    if (!ref) {
      resolver.reject(new Error('Google sign-in callback was missing its handoff reference.'));
      return;
    }
    try {
      const res = await fetch(`${PAWOS_WEB_BASE_URL}/api/auth/google/consume?ref=${encodeURIComponent(ref)}`);
      if (!res.ok) {
        resolver.reject(new Error(`Google sign-in handoff could not be completed (HTTP ${res.status}).`));
        return;
      }
      const payload = (await res.json()) as { idToken?: string; accessToken?: string; profile?: { sub?: string; email?: string; name?: string; picture?: string } };
      if (!payload.idToken || !payload.accessToken || !payload.profile?.sub || !payload.profile?.email) {
        resolver.reject(new Error('Google sign-in handoff response was missing required fields.'));
        return;
      }
      resolver.resolve(
        JSON.stringify({
          idToken: payload.idToken,
          accessToken: payload.accessToken,
          profile: {
            sub: payload.profile.sub,
            email: payload.profile.email,
            name: payload.profile.name ?? payload.profile.email,
            picture: payload.profile.picture,
          },
        })
      );
    } catch (e) {
      resolver.reject(e instanceof Error ? e : new Error('Google sign-in handoff request failed.'));
    }
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
