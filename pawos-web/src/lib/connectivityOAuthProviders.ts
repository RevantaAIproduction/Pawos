/**
 * Server-only OAuth provider config for the Connectivity Runtime's connector platform (Jira,
 * Slack, Linear, Google Workspace, GitHub, GitLab, Vercel, Netlify, Railway) — the pawos-web
 * counterpart to Electron's `ConnectorDefinition.oauth` (see
 * src/shared/connectivity/ConnectivityTypes.ts). Every `clientSecret` here is read from this
 * server's own environment and never leaves it; Electron's OAuthManager only ever calls
 * `/api/connectivity/oauth/exchange`, never a provider's token endpoint directly. Keyed by the
 * same connector id every ConnectorSDK registers under, so a connectorId round-trips unchanged
 * from Electron's authorize-URL build through to this table.
 *
 * `authorizationUrl` is documented here for completeness/parity with the Electron-side
 * definition, but this file only ever needs `tokenUrl` + the client credentials — Electron
 * builds the authorize URL itself (client_id is not secret).
 */
export interface ConnectivityOAuthProviderConfig {
  tokenUrl: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
}

function provider(clientIdEnvVar: string, clientSecretEnvVar: string, tokenUrl: string): ConnectivityOAuthProviderConfig {
  return { tokenUrl, clientId: process.env[clientIdEnvVar], clientSecret: process.env[clientSecretEnvVar] };
}

/**
 * Vercel and Railway's exact third-party OAuth token endpoints are inferred from their public
 * OAuth-app documentation rather than confirmed against a live exchange this session — if either
 * fails with a 404/invalid_client, verify the URL against that provider's current OAuth app
 * dashboard and correct it here (nowhere else needs to change).
 */
export function getConnectivityOAuthProviderConfig(connectorId: string): ConnectivityOAuthProviderConfig | null {
  switch (connectorId) {
    case 'github':
      // Deliberately its own OAuth app (CONNECTOR_GITHUB_*), not GITHUB_CLIENT_ID/SECRET — that
      // pair is Supabase's own sign-in integration, registered with a callback URL that relays a
      // Supabase session code, not a real GitHub authorization code (see
      // pawos-web/src/app/auth/github/callback/route.ts's doc comment).
      return provider('CONNECTOR_GITHUB_CLIENT_ID', 'CONNECTOR_GITHUB_CLIENT_SECRET', 'https://github.com/login/oauth/access_token');
    case 'gitlab':
      return provider('GITLAB_CLIENT_ID', 'GITLAB_CLIENT_SECRET', `${(process.env.GITLAB_URL ?? 'https://gitlab.com').replace(/\/+$/, '')}/oauth/token`);
    case 'linear':
      return provider('LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'https://api.linear.app/oauth/token');
    case 'jira':
      return provider('CONNECTOR_JIRA_CLIENT_ID', 'CONNECTOR_JIRA_CLIENT_SECRET', 'https://auth.atlassian.com/oauth/token');
    case 'slack':
      return provider('SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'https://slack.com/api/oauth.v2.access');
    case 'microsoft': {
      const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
      return provider('MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`);
    }
    case 'googleWorkspace':
      return provider('GOOGLE_WORKSPACE_CLIENT_ID', 'GOOGLE_WORKSPACE_CLIENT_SECRET', 'https://oauth2.googleapis.com/token');
    case 'vercel':
      return provider('CONNECTOR_VERCEL_CLIENT_ID', 'CONNECTOR_VERCEL_CLIENT_SECRET', 'https://api.vercel.com/v2/oauth/access_token');
    case 'netlify':
      return provider('CONNECTOR_NETLIFY_CLIENT_ID', 'CONNECTOR_NETLIFY_CLIENT_SECRET', 'https://api.netlify.com/oauth/token');
    case 'railway':
      return provider('CONNECTOR_RAILWAY_CLIENT_ID', 'CONNECTOR_RAILWAY_CLIENT_SECRET', 'https://backboard.railway.app/oauth/token');
    default:
      return null;
  }
}
