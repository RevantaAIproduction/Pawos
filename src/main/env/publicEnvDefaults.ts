/**
 * Non-secret OAuth/Supabase config, safe to ship inside the installer.
 *
 * A Google/GitHub OAuth "client ID" and a redirect URI are not secrets —
 * they're already visible in the browser's address bar during every sign-in
 * (see GoogleOAuthFlow.ts's authorize URL). Supabase's "publishable" key is
 * public by Supabase's own design (protected by Postgres RLS, not secrecy —
 * see https://supabase.com/docs/guides/api/api-keys). None of these unlock
 * anything on their own the way GOOGLE_CLIENT_SECRET or GEMINI_API_KEY would.
 *
 * Real secrets never live here. Google's token exchange (the one step that
 * needs GOOGLE_CLIENT_SECRET) now happens server-side in pawos-web, which
 * keeps that secret in its own environment — see pawos-web/src/lib/
 * desktopRelay.ts's relayGoogleToDesktop(). This app only ever needs the
 * public half of that flow.
 *
 * These are merged as fallbacks under whatever readEnvFile() finds, so a
 * developer's own .env (e.g. pointing at a different Supabase project) still
 * takes precedence.
 */
export const PUBLIC_ENV_DEFAULTS: Record<string, string> = {
  GOOGLE_CLIENT_ID: '1047116528874-q7uh6289u1h56nogu7pv1mf1eh67q7k5.apps.googleusercontent.com',
  GOOGLE_REDIRECT_URI: 'https://pawos.revantaai.com/auth/google/callback',
  GITHUB_REDIRECT_URI: 'https://pawos.revantaai.com/auth/github/callback',
  MICROSOFT_REDIRECT_URI: 'https://pawos.revantaai.com/auth/microsoft/callback',
  SUPABASE_URL: 'https://krqdxdguqaoehrxhmggz.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_E3vh2q3V3Sj-h7TY341D6Q_EmEneDwQ',
  // Connectivity Runtime connector callback URLs — same non-secret nature as
  // GOOGLE_REDIRECT_URI/GITHUB_REDIRECT_URI above (each is a fixed,
  // already-registered pawos-web route; only the per-connector *client ID*
  // is developer-specific and left unset here). Without these, every OAuth2
  // connector's "Connect" button fails immediately with
  // OAuthManager.ts's "Missing environment variable '..._CALLBACK_URL'"
  // error, regardless of whether the user has ever heard of these vars.
  // GitLab is deliberately absent — no pawos-web callback route exists for
  // it yet (see pawos-web/src/app/api/connectors/, which has no gitlab/
  // directory), so defaulting GITLAB_REDIRECT_URL would just trade one
  // failure for a 404 at that URL instead.
  CONNECTOR_GITHUB_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/github/callback',
  LINEAR_REDIRECT_URL: 'https://pawos.revantaai.com/api/connectors/linear/callback',
  CONNECTOR_JIRA_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/jira/callback',
  CONNECTOR_SLACK_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/slack/callback',
  CONNECTOR_MICROSOFT_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/microsoft/callback',
  CONNECTOR_VERCEL_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/vercel/callback',
  CONNECTOR_NETLIFY_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/netlify/callback',
  CONNECTOR_RAILWAY_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/railway/callback',
};
