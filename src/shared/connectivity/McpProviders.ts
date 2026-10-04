/**
 * MCP provider definitions — one entry per PawOS connector, describing its provider's official
 * Remote MCP server (if any) and how PawOS may use it. Pure data, shared by the main process (the
 * gateway that makes MCP calls), the renderer (Connections UI) and mirrored by pawos-web.
 *
 * MCP is an additional transport for a connector, never a replacement: every connector's existing
 * REST/GraphQL implementation stays the fallback, and every MCP call still passes the connector's
 * own entitlement gate (CONNECTOR_REQUIRED_FEATURE) first.
 *
 * Where each fact comes from (checked 2026-10-04):
 *  - endpoint / authorizationServer / scopes: the server's own published metadata
 *    (/.well-known/oauth-protected-resource and /.well-known/oauth-authorization-server).
 *  - readTools / writeTools: the provider's documentation. A tool is only ever called if it is in
 *    readTools here AND the live server lists it AND the server does not mark it non-read-only.
 *    `toolsVerified: false` means the names have not yet been confirmed against a live tools/list.
 *
 * Authentication models:
 *  - 'existingCredential': the MCP server is protected by the provider's normal OAuth server (or
 *    documents Bearer use of existing tokens), so the connector's existing access token is the
 *    credential. No second sign-in.
 *  - 'mcpSignIn': the MCP server has its own authorization server with dynamic client
 *    registration. PawOS runs a separate, MCP-specific OAuth 2.1 (PKCE) authorization and stores
 *    that credential in the vault under `<connectorId>:mcp`, apart from the connector's REST token.
 *  - 'providerSetup': the provider only allows MCP for an app it has approved/registered with
 *    client credentials; PawOS cannot self-register. Needs configuration outside this codebase.
 */

export type McpAuthModel = 'existingCredential' | 'mcpSignIn' | 'providerSetup';

export interface McpProviderDefinition {
  /** The PawOS connector id this MCP server belongs to. */
  connectorId: string;
  serverName: string;
  endpoint: string;
  transport: 'streamable-http';
  auth: McpAuthModel;
  /** Issuer of the OAuth server that protects the endpoint. */
  authorizationServer: string;
  /** Scopes requested for an 'mcpSignIn' authorization. Empty for 'existingCredential'. */
  mcpScopes: string[];
  /** True when the endpoint itself only exposes read tools. */
  readOnlyEndpoint: boolean;
  /** Read tools PawOS may call. Anything not listed here is never called. */
  readTools: string[];
  /**
   * Write tools the server documents. Declared for the provider matrix only: PawOS has no MCP
   * write path yet, so none of these can be called. Existing API write-back is unchanged.
   */
  writeTools: string[];
  /** False until the tool names were confirmed against a live tools/list. */
  toolsVerified: boolean;
  /** What must be true outside PawOS before this works, if anything. */
  requirement?: string;
}

/** Vault / durable-store connector id of a connector's separate MCP credential. */
export function mcpCredentialId(connectorId: string): string {
  return `${connectorId}:mcp`;
}

export function isMcpCredentialId(id: string): boolean {
  return id.endsWith(':mcp');
}

export function baseConnectorId(id: string): string {
  return isMcpCredentialId(id) ? id.slice(0, -':mcp'.length) : id;
}

export const MCP_PROVIDERS: Record<string, McpProviderDefinition> = {
  linear: {
    connectorId: 'linear',
    serverName: 'Linear MCP',
    endpoint: 'https://mcp.linear.app/mcp/readonly',
    transport: 'streamable-http',
    auth: 'existingCredential',
    authorizationServer: 'https://mcp.linear.app',
    mcpScopes: [],
    readOnlyEndpoint: true,
    readTools: ['list_issues', 'list_my_issues', 'get_issue', 'list_comments', 'list_teams', 'get_team', 'list_projects', 'get_project', 'list_users', 'get_user', 'list_issue_statuses', 'list_issue_labels', 'list_cycles'],
    writeTools: ['create_issue', 'update_issue', 'create_comment'],
    toolsVerified: false,
  },
  github: {
    connectorId: 'github',
    serverName: 'GitHub MCP',
    endpoint: 'https://api.githubcopilot.com/mcp/readonly',
    transport: 'streamable-http',
    auth: 'existingCredential',
    authorizationServer: 'https://github.com/login/oauth',
    mcpScopes: [],
    readOnlyEndpoint: true,
    readTools: [
      'get_me',
      'get_teams',
      'search_repositories',
      'get_file_contents',
      'get_commit',
      'list_commits',
      'list_branches',
      'list_tags',
      'list_releases',
      'get_latest_release',
      'search_code',
      'list_issues',
      'search_issues',
      'issue_read',
      'list_pull_requests',
      'search_pull_requests',
      'pull_request_read',
    ],
    writeTools: ['issue_write', 'add_issue_comment', 'create_pull_request', 'update_pull_request', 'pull_request_review_write'],
    toolsVerified: false,
  },
  gitlab: {
    connectorId: 'gitlab',
    serverName: 'GitLab MCP',
    endpoint: 'https://gitlab.com/api/v4/mcp',
    transport: 'streamable-http',
    // GitLab's MCP server requires the `mcp` scope. PawOS's GitLab OAuth application is left
    // untouched; the MCP credential comes from a separate, dynamically registered client instead.
    auth: 'mcpSignIn',
    authorizationServer: 'https://gitlab.com',
    mcpScopes: ['mcp'],
    readOnlyEndpoint: false,
    readTools: ['get_mcp_server_version', 'get_issue', 'get_merge_request', 'get_merge_request_commits', 'get_merge_request_diffs', 'get_merge_request_pipelines', 'get_pipeline_jobs', 'gitlab_search'],
    writeTools: ['create_issue', 'create_merge_request'],
    toolsVerified: false,
    requirement: 'On GitLab.com the group owner must allow MCP server access for the group (beta feature).',
  },
  bitbucket: {
    connectorId: 'bitbucket',
    serverName: 'Atlassian Rovo MCP',
    endpoint: 'https://mcp.atlassian.com/v1/mcp',
    transport: 'streamable-http',
    auth: 'mcpSignIn',
    authorizationServer: 'https://mcp.atlassian.com',
    mcpScopes: [],
    readOnlyEndpoint: false,
    // Atlassian documents Bitbucket as covered by the Rovo MCP server, but publishes no Bitbucket
    // tool names PawOS could confirm. Nothing is callable until a live tools/list names them.
    readTools: [],
    writeTools: [],
    toolsVerified: false,
    requirement: 'Bitbucket tool names on the Atlassian Rovo MCP server are not confirmed yet.',
  },
  jira: {
    connectorId: 'jira',
    serverName: 'Atlassian Rovo MCP',
    endpoint: 'https://mcp.atlassian.com/v1/mcp',
    transport: 'streamable-http',
    auth: 'mcpSignIn',
    authorizationServer: 'https://mcp.atlassian.com',
    mcpScopes: [],
    readOnlyEndpoint: false,
    readTools: [
      'atlassianUserInfo',
      'getAccessibleAtlassianResources',
      'getVisibleJiraProjects',
      'getJiraIssue',
      'searchJiraIssuesUsingJql',
      'getJiraIssueRemoteIssueLinks',
      'getJiraIssueTypeMetaWithFields',
      'getTransitionsForJiraIssue',
      'lookupJiraAccountId',
    ],
    writeTools: ['createJiraIssue', 'editJiraIssue', 'addCommentToJiraIssue', 'transitionJiraIssue'],
    toolsVerified: false,
  },
  slack: {
    connectorId: 'slack',
    serverName: 'Slack MCP',
    endpoint: 'https://mcp.slack.com/mcp',
    transport: 'streamable-http',
    auth: 'providerSetup',
    authorizationServer: 'https://mcp.slack.com',
    mcpScopes: [],
    readOnlyEndpoint: false,
    readTools: [],
    writeTools: [],
    toolsVerified: false,
    requirement:
      "Slack only allows MCP for an internal or Marketplace-published Slack app, authorised per user (user token, client secret, no dynamic registration). PawOS's Slack app would need MCP enabled and user scopes added in Slack's app settings.",
  },
  vercel: {
    connectorId: 'vercel',
    serverName: 'Vercel MCP',
    endpoint: 'https://mcp.vercel.com',
    transport: 'streamable-http',
    auth: 'existingCredential',
    authorizationServer: 'https://vercel.com',
    mcpScopes: [],
    readOnlyEndpoint: false,
    readTools: ['list_teams', 'list_projects', 'get_project', 'list_deployments', 'get_deployment'],
    writeTools: [],
    toolsVerified: false,
  },
  netlify: {
    connectorId: 'netlify',
    serverName: 'Netlify MCP',
    endpoint: 'https://netlify-mcp.netlify.app/mcp',
    transport: 'streamable-http',
    auth: 'mcpSignIn',
    authorizationServer: 'https://netlify-mcp.netlify.app',
    mcpScopes: ['read', 'offline_access'],
    readOnlyEndpoint: false,
    // Netlify's tools take an `operation` argument that mixes reads and writes under one tool
    // name, so a name-based read allowlist cannot be made safe until the live schema is seen.
    readTools: [],
    writeTools: [],
    toolsVerified: false,
    requirement: 'Netlify MCP tools combine read and write operations under one tool; a safe read allowlist needs the live tool schema.',
  },
  railway: {
    connectorId: 'railway',
    serverName: 'Railway MCP',
    endpoint: 'https://mcp.railway.com',
    transport: 'streamable-http',
    auth: 'existingCredential',
    authorizationServer: 'https://backboard.railway.com',
    mcpScopes: [],
    readOnlyEndpoint: false,
    readTools: ['whoami', 'list-projects', 'list-services'],
    writeTools: ['create-project', 'redeploy', 'accept-deploy'],
    toolsVerified: false,
  },
};

export function getMcpProvider(connectorId: string): McpProviderDefinition | undefined {
  return MCP_PROVIDERS[connectorId];
}
