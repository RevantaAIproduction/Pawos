import { getMcpProvider } from '../../../shared/connectivity/McpProviders';
import { McpError, McpReadClient } from './McpReadClient';

export type ConnectorMcpProbeResult =
  | { status: 'accepted'; toolNames: string[] }
  | { status: 'separateSignIn' }
  | { status: 'providerSetup' }
  | { status: 'unauthorized' | 'unavailable' | 'malformed' | 'no-read-tool'; message: string };

/** Tool names come from a remote server: keep only plain identifiers before they reach a log line. */
function safeToolNames(names: string[]): string[] {
  return names.filter((name) => /^[A-Za-z0-9_.-]{1,64}$/.test(name)).slice(0, 120);
}

const probedThisSession = new Set<string>();

/**
 * Asks a connector's MCP server (see McpProviders.ts) whether it accepts the connector's existing
 * access token, and which tools it offers — initialize and tools/list only. It never calls a tool,
 * so it cannot read or change anything at the provider. Runs once per connector per app session
 * and writes a single `[mcp]` log line with the outcome and tool names (never the token).
 *
 * Only 'existingCredential' providers are probed. A provider with its own MCP sign-in is never
 * sent the connector's token — it would not accept it.
 *
 * This is how each provider's tool list gets confirmed before its allowlist is marked verified.
 */
export async function probeConnectorMcp(connectorId: string, accessToken: string | undefined): Promise<ConnectorMcpProbeResult | undefined> {
  const provider = getMcpProvider(connectorId);
  if (!provider || process.env.PAWOS_MCP_DISABLED === '1') return undefined;
  if (probedThisSession.has(connectorId)) return undefined;
  probedThisSession.add(connectorId);

  if (provider.auth === 'mcpSignIn') {
    console.info(`[mcp] ${connectorId}: ${provider.serverName} needs its own sign-in; PawOS's existing ${connectorId} token is not sent to it.`);
    return { status: 'separateSignIn' };
  }
  if (provider.auth === 'providerSetup') {
    console.info(`[mcp] ${connectorId}: ${provider.serverName} is not set up for PawOS yet; nothing is sent to it.`);
    return { status: 'providerSetup' };
  }
  if (!accessToken) return undefined;

  try {
    const tools = await new McpReadClient(provider.endpoint, provider.serverName).listTools(accessToken);
    const toolNames = safeToolNames(tools.map((tool) => tool.name));
    console.info(`[mcp] ${connectorId}: ${provider.serverName} accepted the existing token — ${toolNames.length} tools: ${toolNames.join(', ')}`);
    return { status: 'accepted', toolNames };
  } catch (error) {
    const failure = error instanceof McpError ? error : new McpError('unavailable', `Unexpected ${provider.serverName} failure.`);
    console.info(`[mcp] ${connectorId}: ${failure.kind} — ${failure.message}`);
    return { status: failure.kind, message: failure.message };
  }
}

/** Test hook: forget which connectors were probed. */
export function resetConnectorMcpProbes(): void {
  probedThisSession.clear();
}
