import { stashGoogleAuthPayload } from "./googleAuthRelayStore";

/**
 * Shared by auth/google/callback and auth/github/callback: both routes
 * exist only to receive the OAuth provider's redirect when a PawOS desktop
 * sign-in is in progress, and hand the result back to the desktop app.
 *
 * This used to fetch http://127.0.0.1:PORT from here — which only ever
 * worked when this Next.js server and the Electron app ran on the same
 * machine. Now that pawos-web runs on a real remote host, this process has
 * no network path to a port on the user's own computer. Instead, the page
 * below redirects the browser itself to a pawos:// custom-protocol URL,
 * which Windows/macOS/Linux route directly to the already-running PawOS
 * app (see OAuthProtocolBridge.ts / main.ts's protocol registration) — no
 * server-to-desktop network hop involved at all.
 */
export function relayToDesktop(scheme: "google-auth-callback" | "github-auth-callback", code: string | null, error: string | null): Response {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (error) params.set("error", error);
  return buildRelayResponse(`pawos://${scheme}?${params.toString()}`, error);
}

/**
 * The Connectivity Runtime's own connector-OAuth relay (Jira, Slack, Linear, Vercel, Netlify,
 * Railway, and GitLab/GitHub-as-a-connector) — a thin forward of the raw authorization code and
 * `state` (OAuthManager's request-id correlation, see src/main/connectivity/OAuthManager.ts) to
 * `pawos://connectivity-oauth-callback`. Deliberately does NOT exchange the code for a token here:
 * unlike PawOS's own Google/GitHub sign-in (which need the finished profile immediately to bridge
 * into a Supabase session), a connector's OAuthManager.exchangeCodeForToken already routes through
 * `/api/connectivity/oauth/exchange` — the one place every connector's client_secret lives — so
 * there is no reason to duplicate that call here.
 */
export function relayConnectivityToDesktop(code: string | null, error: string | null, state: string | null): Response {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (error) params.set("error", error);
  if (state) params.set("state", state);
  return buildRelayResponse(`pawos://connectivity-oauth-callback?${params.toString()}`, error);
}

/**
 * Google-specific: this app's OAuth client is a "Web application" type,
 * meaning the token exchange requires GOOGLE_CLIENT_SECRET. That secret
 * must never be bundled into the publicly-distributed desktop installer
 * (an asar archive is trivially extractable, so shipping it there would
 * leak it to every download). Instead, the exchange happens right here,
 * server-side, using this server's own environment — the desktop app never
 * sees the code or the secret, only the finished tokens/profile, relayed
 * onward via the same pawos:// handoff as everything else.
 *
 * The finished id_token/access_token are NOT embedded in the pawos:// deep link — see
 * googleAuthRelayStore.ts's doc comment for why (long real tokens make the URL silently
 * undeliverable). Instead they're stashed server-side under a short single-use `ref`, and only
 * that ref goes in the deep link; Electron fetches the real payload via /api/auth/google/consume.
 */
export async function relayGoogleToDesktop(code: string | null, error: string | null): Promise<Response> {
  if (error) return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error }).toString()}`, error);
  if (!code) {
    const missing = "missing_code";
    return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: missing }).toString()}`, missing);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    const notConfigured = "server_not_configured";
    return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: notConfigured }).toString()}`, notConfigured);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) {
      const failed = `token_exchange_failed_${tokenResponse.status}`;
      return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };
    if (!tokens.id_token) {
      const missing = "no_id_token";
      return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: missing }).toString()}`, missing);
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      const failed = "profile_fetch_failed";
      return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const profile = (await profileResponse.json()) as { sub: string; email: string; name?: string; picture?: string };

    const ref = stashGoogleAuthPayload({
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      profile,
    });
    return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ ref }).toString()}`, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: message }).toString()}`, message);
  }
}

/**
 * Chrome/Edge/Firefox routinely block a script-driven `window.location.href` navigation to a
 * custom protocol (`pawos://…`) when the page wasn't given a fresh, direct user gesture at the
 * moment of navigation — a full OAuth round trip (redirect to Google, redirect back here) doesn't
 * count, even though the whole flow started from a real click on "Continue with Google". When
 * blocked, browsers give no error and no prompt — the page just sits here forever, which looks
 * identical to "PawOS never received the callback" from the user's side. The auto-redirect below
 * is still attempted (it does work in some browsers/versions), but the real, reliable path is the
 * big button, which IS a direct user gesture and reliably clears every browser's custom-protocol
 * gate. Making it the visually primary element (not a buried "click here" text link) is the actual
 * fix — most users never notice a small fallback link and just wait, which is exactly how this bug
 * was reported.
 */
function buildRelayResponse(deepLink: string, error: string | null): Response {
  const styles = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 48px 24px; max-width: 420px; margin: 0 auto; text-align: center; color: #1a1a1a; }
    .button { display: inline-block; margin-top: 20px; padding: 14px 32px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; }
    .button:hover { background: #1d4ed8; }
    .hint { margin-top: 16px; color: #666; font-size: 14px; }
  `;
  const body = error
    ? `<html><head><style>${styles}</style></head><body>
        <p>Sign-in failed: ${escapeHtml(error)}.</p>
        <a class="button" href="${escapeHtml(deepLink)}">Return to PawOS</a>
        <p class="hint">Or close this window and try again.</p>
      </body></html>`
    : `<html><head><style>${styles}</style></head><body>
        <p>Signed in successfully.</p>
        <a class="button" id="return-link" href="${escapeHtml(deepLink)}">Return to PawOS</a>
        <p class="hint">Click the button above if you're not redirected automatically.</p>
        <script>
          // Best-effort automatic redirect — silently no-ops in browsers that block it, in which
          // case the button above (a genuine user click) is what actually gets the user through.
          window.location.href = ${JSON.stringify(deepLink)};
        </script>
      </body></html>`;

  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
