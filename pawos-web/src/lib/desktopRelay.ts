import { stashGoogleAuthPayload } from "./googleAuthRelayStore";
import { stashMicrosoftAuthPayload } from "./microsoftAuthRelayStore";

/**
 * auth/github/callback's relay — receives Supabase's redirect when a PawOS desktop GitHub
 * sign-in is in progress, and hands the raw PKCE `code` back to the desktop app so its own
 * renderer can call supabase.auth.exchangeCodeForSession() (that call must run in the same
 * Supabase client instance that started the flow, since the code_verifier lives in its local
 * storage — this route never does the exchange itself).
 *
 * This used to redirect the browser to a pawos://github-auth-callback custom-protocol URL —
 * confirmed unreliable in production ("GitHub sign-in not responding"): browsers silently
 * throttle a script-driven navigation to a custom protocol when the full OAuth redirect chain
 * doesn't read as a fresh direct user gesture, with no error and no dialog show up, so the page
 * just sits there forever. relayGoogleToDesktop below already solved this identical problem for
 * Google via a same-machine loopback HTTP redirect (RFC 8252 "OAuth for Native Apps") instead of
 * a custom protocol — this reuses that same fix. See GitHubOAuthFlow.ts's own doc comment for
 * the matching Electron-side listener. No Supabase dashboard change is needed: the hosted
 * callback URL Supabase itself redirects the browser to is unchanged; only what this page does
 * next (loopback redirect instead of a pawos:// deep link) is different.
 */
export function relayGitHubToDesktop(code: string | null, error: string | null): Response {
  if (error) return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error }).toString()}`, error);
  if (!code) {
    const missing = "missing_code";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: missing }).toString()}`, missing);
  }
  return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ code }).toString()}`, null);
}

/**
 * The Connectivity Runtime's own connector-OAuth relay (Jira, Slack, Linear, Vercel, Netlify,
 * Railway, and GitLab/GitHub-as-a-connector). Deliberately does NOT exchange the code for a token
 * here: unlike PawOS's own Google/GitHub sign-in (which need the finished profile immediately to
 * bridge into a Supabase session), a connector's OAuthManager.exchangeCodeForToken already routes
 * through `/api/connectivity/oauth/exchange` — the one place every connector's client_secret
 * lives — so there is no reason to duplicate that call here.
 *
 * This used to redirect the browser to `pawos://connectivity-oauth-callback` — confirmed broken
 * in the same way `relayGitHubToDesktop` above already documented and fixed: Chromium-based
 * browsers on Windows can silently block a script-driven navigation to a custom protocol with no
 * error shown, leaving the desktop app's "Waiting for you to finish signing in..." stuck forever
 * even though the consent screen itself completed successfully. Fixed the same way — a
 * same-machine loopback HTTP redirect instead of a custom protocol — to the fixed local port
 * OAuthManager.ts's `ensureConnectivityRelayListener()` listens on
 * (`CONNECTIVITY_LOCAL_RELAY_PORT`, currently 51900). Unlike the sign-in flows' one-shot listener
 * on port 51899, that port hosts a long-lived listener so more than one connector authorization
 * can be in flight at once, matching OAuthManager's existing concurrent-authorization design.
 */
const CONNECTIVITY_LOCAL_CALLBACK_URL = "http://127.0.0.1:51900/callback";

export function relayConnectivityToDesktop(code: string | null, error: string | null, state: string | null): Response {
  const params = new URLSearchParams();
  if (code) params.set("code", code);
  if (error) params.set("error", error);
  if (state) params.set("state", state);
  return buildRelayResponse(`${CONNECTIVITY_LOCAL_CALLBACK_URL}?${params.toString()}`, error);
}

/**
 * Loopback callback this relay hands the browser to — the same port GoogleOAuthFlow.ts listens
 * on (see its own doc comment for why: this is the RFC 8252 "OAuth for Native Apps" pattern used
 * by Claude Desktop/Cursor/VS Code/gcloud/etc., not a pawos:// custom protocol). A remote server
 * can't reach a port on the user's own machine, but the *browser* redirecting there is a normal
 * same-machine HTTP request — no OS protocol registry, no external-app dialog, no browser
 * anti-abuse throttling involved at all.
 */
const LOCAL_CALLBACK_URL = "http://127.0.0.1:51899/callback";

/**
 * Google-specific: this app's OAuth client is a "Web application" type,
 * meaning the token exchange requires GOOGLE_CLIENT_SECRET. That secret
 * must never be bundled into the publicly-distributed desktop installer
 * (an asar archive is trivially extractable, so shipping it there would
 * leak it to every download). Instead, the exchange happens right here,
 * server-side, using this server's own environment — the desktop app never
 * sees the code or the secret, only the finished tokens/profile, relayed
 * onward via the loopback handoff above.
 *
 * The finished id_token/access_token are NOT embedded in the loopback URL — they're stashed
 * server-side under a short single-use `ref` (see googleAuthRelayStore.ts), and only that ref
 * goes in the URL; GoogleOAuthFlow.ts's local listener fetches the real payload via
 * /api/auth/google/consume the instant it receives the request.
 */
export async function relayGoogleToDesktop(code: string | null, error: string | null): Promise<Response> {
  if (error) return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error }).toString()}`, error);
  if (!code) {
    const missing = "missing_code";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: missing }).toString()}`, missing);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    const notConfigured = "server_not_configured";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: notConfigured }).toString()}`, notConfigured);
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
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };
    if (!tokens.id_token) {
      const missing = "no_id_token";
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: missing }).toString()}`, missing);
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      const failed = "profile_fetch_failed";
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const profile = (await profileResponse.json()) as { sub: string; email: string; name?: string; picture?: string };

    const ref = stashGoogleAuthPayload({
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      profile,
    });
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ ref }).toString()}`, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: message }).toString()}`, message);
  }
}

/**
 * Microsoft OAuth relay — identical pattern to relayGoogleToDesktop. Exchanges the authorization
 * code for tokens server-side (this server holds MICROSOFT_CLIENT_SECRET), fetches the user profile
 * from Microsoft Graph, stashes the payload with a temporary ref, and redirects the browser to the
 * desktop's loopback listener with just the ref. Desktop then fetches the actual tokens via
 * /api/auth/microsoft/consume?ref=...
 */
export async function relayMicrosoftToDesktop(code: string | null, error: string | null): Promise<Response> {
  if (error) return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error }).toString()}`, error);
  if (!code) {
    const missing = "missing_code";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: missing }).toString()}`, missing);
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID ?? 'common';
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? 'https://pawos.revantaai.com/auth/microsoft/callback';
  if (!clientId || !clientSecret) {
    const notConfigured = "server_not_configured";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: notConfigured }).toString()}`, notConfigured);
  }

  try {
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        scope: "openid email profile",
      }),
    });
    if (!tokenResponse.ok) {
      const failed = `token_exchange_failed_${tokenResponse.status}`;
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };
    if (!tokens.id_token) {
      const missing = "no_id_token";
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: missing }).toString()}`, missing);
    }

    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profileResponse.ok) {
      const failed = "profile_fetch_failed";
      return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: failed }).toString()}`, failed);
    }
    const profile = (await profileResponse.json()) as { id: string; mail: string; displayName?: string };

    const ref = stashMicrosoftAuthPayload({
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      profile,
    });
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ ref }).toString()}`, null);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    return buildRelayResponse(`${LOCAL_CALLBACK_URL}?${new URLSearchParams({ error: message }).toString()}`, message);
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
