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
  // already-registered pawos-web route; the per-connector client IDs are
  // below). Without these, every OAuth2
  // connector's "Connect" button fails immediately with
  // OAuthManager.ts's "Missing environment variable '..._CALLBACK_URL'"
  // error, regardless of whether the user has ever heard of these vars.
  // GitLab's callback lives at /auth/gitlab/callback (same thin relay back to Electron).
  // GitHub, Slack and Microsoft use the callback URLs their provider apps are registered with — the
  // same values as the desktop .env (a mismatch here is what made them fail only in installed builds).
  CONNECTOR_GITHUB_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectivity/oauth/callback/github',
  LINEAR_REDIRECT_URL: 'https://pawos.revantaai.com/api/connectors/linear/callback',
  CONNECTOR_JIRA_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/jira/callback',
  CONNECTOR_SLACK_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectivity/oauth/callback/slack',
  // Unset in the desktop .env, so the connector has always used OAuthManager's default redirect.
  CONNECTOR_MICROSOFT_CALLBACK_URL: 'pawos://connectivity-oauth-callback',
  CONNECTOR_VERCEL_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/vercel/callback',
  CONNECTOR_NETLIFY_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/netlify/callback',
  CONNECTOR_RAILWAY_CALLBACK_URL: 'https://pawos.revantaai.com/api/connectors/railway/callback',
  GITLAB_REDIRECT_URL: 'https://pawos.revantaai.com/auth/gitlab/callback',
  // Connectivity Runtime connector OAuth client IDs. Public by OAuth design (every authorize URL
  // shows them); the packaged app has no .env, so without these every connector's Connect fails
  // with OAuthManager's "Missing environment variable '<X>_CLIENT_ID'". Each is that connector's
  // own OAuth app and must match the client ID pawos-web uses for the same provider — the code
  // exchange and refresh (which need the secret) run server-side (connectivityOAuthProviders.ts).
  CONNECTOR_JIRA_CLIENT_ID: 'X2tQ5JISzvC5TdyInOP9eBYUwKwZg9iT', // Jira
  LINEAR_CLIENT_ID: 'bf7fd5cc7daa1bd86c00e8bd3d2e3a70', // Linear
  CONNECTOR_GITHUB_CLIENT_ID: 'Ov23li81wFouTZ29HntS', // GitHub (connector app, not GitHub sign-in)
  SLACK_CLIENT_ID: '11673740826419.11683711445348', // Slack
  MICROSOFT_CLIENT_ID: '44f5d09f-7f97-4f87-b977-ee1c2ef6e670', // Microsoft 365
  GOOGLE_WORKSPACE_CLIENT_ID: '1047116528874-runsi8mp0hlrvoavj244d1fo7jvn07m3.apps.googleusercontent.com', // Google Workspace (separate app from Google sign-in / GOOGLE_CLIENT_ID)
  CONNECTOR_VERCEL_CLIENT_ID: 'cl_JyLv2QB2x2AbQJh9fbTkutUCyx4Hge8f', // Vercel
  CONNECTOR_NETLIFY_CLIENT_ID: '3AsHcLCw62TC5vq337oDTxdZWvn_caGBCfnO5cwsWvU', // Netlify
  GITLAB_CLIENT_ID: 'd22722ceb493803c08bf8782c0505e24db8278744a75f2f6c18713cb204bcfb6', // GitLab (the pawos.revantaai.com app — not the localhost dev app)
  CONNECTOR_RAILWAY_CLIENT_ID: 'rlwy_oaci_jajrZyYQblhXonmgoAA2syFu', // Railway
};
