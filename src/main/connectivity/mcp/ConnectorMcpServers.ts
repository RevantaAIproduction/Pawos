import { McpError, McpReadClient } from './McpReadClient';

/**
 * The official Remote MCP server for each PawOS connector, and whether PawOS can use it with the
 * token it already holds.
 *
 * `auth` comes from each server's own published OAuth metadata
 * (/.well-known/oauth-protected-resource), checked on 2026-10-04:
 *  - 'providerToken': the server names the provider's normal OAuth server as its authorization
 *    server (or documents Bearer use of existing tokens), so the connector's existing access token
 *    is the right credential to present.
 *  - 'separateSignIn': the server runs its own authorization server with dynamic client
 *    registration. The connector's existing token is not for it; using it needs a second,
 *    MCP-specific consent, which PawOS does not implement yet. Never sent a token.
 *
 * Read-only endpoints are used wherever the provider offers one.
 */
export interface ConnectorMcpServer {
  endpoint: string;
  serverName: string;
  auth: 'providerToken' | 'separateSignIn';
}

export const CONNECTOR_MCP_SERVERS: Record<string, ConnectorMcpServer> = {
  linear: { endpoint: 'https://mcp.linear.app/mcp/readonly', serverName: 'Linear MCP', auth: 'providerToken' },
  github: { endpoint: 'https://api.githubcopilot.com/mcp/readonly', serverName: 'GitHub MCP', auth: 'providerToken' },
  // Requires the `mcp` OAuth scope, which PawOS's GitLab app does not request today.
  gitlab: { endpoint: 'https://gitlab.com/api/v4/mcp', serverName: 'GitLab MCP', auth: 'providerToken' },
  vercel: { endpoint: 'https://mcp.vercel.com', serverName: 'Vercel MCP', auth: 'providerToken' },
  railway: { endpoint: 'https://mcp.railway.com', serverName: 'Railway MCP', auth: 'providerToken' },
  jira: { endpoint: 'https://mcp.atlassian.com/v1/mcp', serverName: 'Atlassian MCP', auth: 'separateSignIn' },
  netlify: { endpoint: 'https://netlify-mcp.netlify.app/mcp', serverName: 'Netlify MCP', auth: 'separateSignIn' },
  slack: { endpoint: 'https://mcp.slack.com/mcp', serverName: 'Slack MCP', auth: 'separateSignIn' },
};

export type ConnectorMcpProbeResult =
  | { status: 'accepted'; toolNames: string[] }
  | { status: 'separateSignIn' }
  | { status: 'unauthorized' | 'unavailable' | 'malformed' | 'no-read-tool'; message: string };

/** Tool names come from a remote server: keep only plain identifiers before they reach a log line. */
function safeToolNames(names: string[]): string[] {
  return names.filter((name) => /^[A-Za-z0-9_.-]{1,64}$/.test(name)).slice(0, 120);
}

const probedThisSession = new Set<string>();

/**
 * Asks a connector's MCP server whether it accepts the connector's existing access token, and
 * which tools it offers — initialize and tools/list only. It never calls a tool, so it cannot read
 * or change anything in the provider. Runs once per connector per app session, and writes a single
 * `[mcp]` log line with the outcome and tool names (never the token).
 *
 * This is how PawOS learns, per connector, whether an MCP read path is possible at all before any
 * connector-specific tool mapping is written.
 */
export async function probeConnectorMcp(connectorId: string, accessToken: string | undefined): Promise<ConnectorMcpProbeResult | undefined> {
  const server = CONNECTOR_MCP_SERVERS[connectorId];
  if (!server || process.env.PAWOS_MCP_DISABLED === '1') return undefined;
  if (probedThisSession.has(connectorId)) return undefined;
  probedThisSession.add(connectorId);

  if (server.auth === 'separateSignIn') {
    console.info(`[mcp] ${connectorId}: ${server.serverName} needs its own sign-in; PawOS's existing ${connectorId} token is not sent to it.`);
    return { status: 'separateSignIn' };
  }
  if (!accessToken) return undefined;

  try {
    const tools = await new McpReadClient(server.endpoint, server.serverName).listTools(accessToken);
    const toolNames = safeToolNames(tools.map((tool) => tool.name));
    console.info(`[mcp] ${connectorId}: ${server.serverName} accepted the existing token — ${toolNames.length} tools: ${toolNames.join(', ')}`);
    return { status: 'accepted', toolNames };
  } catch (error) {
    const failure = error instanceof McpError ? error : new McpError('unavailable', `Unexpected ${server.serverName} failure.`);
    console.info(`[mcp] ${connectorId}: ${failure.kind} — ${failure.message}`);
    return { status: failure.kind, message: failure.message };
  }
}

/** Test hook: forget which connectors were probed. */
export function resetConnectorMcpProbes(): void {
  probedThisSession.clear();
}
