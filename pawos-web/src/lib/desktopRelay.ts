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

    const params = new URLSearchParams();
    params.set("id_token", tokens.id_token);
    params.set("access_token", tokens.access_token);
    params.set("sub", profile.sub);
    params.set("email", profile.email);
    if (profile.name) params.set("name", profile.name);
    if (profile.picture) params.set("picture", profile.picture);
    return buildRelayResponse(`pawos://google-auth-callback?${params.toString()}`, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return buildRelayResponse(`pawos://google-auth-callback?${new URLSearchParams({ error: message }).toString()}`, message);
  }
}

function buildRelayResponse(deepLink: string, error: string | null): Response {
  const body = error
    ? `<html><body style="font-family:sans-serif;padding:40px;">
        <p>Sign-in failed: ${escapeHtml(error)}.</p>
        <p><a href="${escapeHtml(deepLink)}">Click here to return to PawOS</a>, or close this window and try again.</p>
      </body></html>`
    : `<html><body style="font-family:sans-serif;padding:40px;">
        <p>Signed in — returning you to PawOS&hellip;</p>
        <p>If nothing happens, <a href="${escapeHtml(deepLink)}">click here</a>.</p>
        <script>window.location.href = ${JSON.stringify(deepLink)};</script>
      </body></html>`;

  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
