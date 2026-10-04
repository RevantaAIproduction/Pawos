import { getMcpProvider, MCP_PROVIDERS, type McpProviderDefinition } from '../../../shared/connectivity/McpProviders';
import { connectorRegistry } from '../ConnectorRegistry';
import { isConnectorEntitled } from '../ConnectorEntitlementGate';
import { credentialVaultBridge } from '../CredentialVaultBridge';
import { McpError, McpReadClient, type McpTool } from './McpReadClient';
import { mcpOAuthFlow } from './McpOAuthFlow';

/**
 * The one place PawOS calls a provider's MCP server on behalf of the assistant. Every call goes
 * through the same checks, in this order, and stops at the first that fails:
 *
 *   1. the connector has an MCP provider definition;
 *   2. the account is entitled to the connector (the same FeatureId gate as connecting it);
 *   3. the tool is on that provider's read allowlist (McpProviders.ts);
 *   4. a credential exists — the connector's own token, or the separate MCP sign-in, per provider;
 *   5. the live server lists the tool and does not mark it non-read-only or destructive.
 *
 * There is no write path here: nothing in this file can call a tool outside `readTools`.
 *
 * MCP is an additional transport. A failure of any kind is returned as a result, never thrown,
 * and tells the caller to use the connector's existing actions (REST/GraphQL), which are untouched.
 *
 * Everything a server returns is untrusted external data. Tool descriptions are never read, and
 * tool results are passed back as bounded text marked untrusted — for the assistant to read as
 * data, never to follow as instructions.
 */

const MAX_ARGUMENT_CHARS = 4_000;
const MAX_CONTENT_CHARS = 24_000;

export type McpGatewayFailureCode =
  | 'mcp-unavailable'
  | 'not-entitled'
  | 'provider-setup-required'
  | 'needs-mcp-sign-in'
  | 'not-connected'
  | 'tool-not-allowed'
  | 'tool-not-offered'
  | 'invalid-arguments'
  | 'unauthorized'
  | 'unavailable'
  | 'malformed';

export type McpGatewayFailure = { ok: false; code: McpGatewayFailureCode; message: string };

export interface McpReadToolInfo {
  name: string;
  /** Argument names the server's schema declares for the tool. */
  arguments: string[];
}

export type McpListToolsResult = { ok: true; connectorId: string; serverName: string; tools: McpReadToolInfo[] } | McpGatewayFailure;

export type McpCallResult =
  | { ok: true; connectorId: string; tool: string; source: 'mcp'; untrusted: true; content: string; truncated: boolean }
  | McpGatewayFailure;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeReadTool(tool: McpTool): boolean {
  return tool.readOnlyHint !== false && tool.destructiveHint !== true;
}

/** The text of a tools/call result: text parts, or the structured content as JSON. */
function resultText(result: unknown): string | undefined {
  if (!isObject(result)) return undefined;
  const parts = Array.isArray(result.content) ? result.content : [];
  const text = parts
    .filter((part): part is JsonObject => isObject(part) && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
  if (text) return text;
  if (result.structuredContent !== undefined) return JSON.stringify(result.structuredContent);
  return undefined;
}

class ConnectorMcpGateway {
  private clients = new Map<string, McpReadClient>();

  private client(provider: McpProviderDefinition): McpReadClient {
    let client = this.clients.get(provider.connectorId);
    if (!client) {
      client = new McpReadClient(provider.endpoint, provider.serverName);
      this.clients.set(provider.connectorId, client);
    }
    return client;
  }

  /** Steps 1, 2 and 4 above. Returns the token to present, or the reason there isn't one. */
  private async authorize(connectorId: string): Promise<{ ok: true; provider: McpProviderDefinition; token: string } | McpGatewayFailure> {
    const provider = getMcpProvider(connectorId);
    if (!provider) return { ok: false, code: 'mcp-unavailable', message: `There is no MCP server for '${connectorId}'. Use its existing connector actions.` };
    if (!isConnectorEntitled(connectorId)) {
      return { ok: false, code: 'not-entitled', message: `${provider.serverName} is not available on this plan.` };
    }
    if (provider.auth === 'providerSetup') {
      return { ok: false, code: 'provider-setup-required', message: `${provider.serverName} is not set up for PawOS yet. Use the existing ${connectorId} connector actions.` };
    }

    if (provider.auth === 'mcpSignIn') {
      const token = await mcpOAuthFlow.getAccessToken(connectorId);
      if (!token) {
        return { ok: false, code: 'needs-mcp-sign-in', message: `${provider.serverName} needs its own sign-in (Settings > Connections > Enable MCP access). Use the existing ${connectorId} connector actions meanwhile.` };
      }
      return { ok: true, provider, token };
    }

    // The connector's own credential. Connectors that manage expiry expose a fresh-token getter.
    const sdk = connectorRegistry.get(connectorId) as { getFreshAccessToken?: () => Promise<string | undefined> } | undefined;
    const token = typeof sdk?.getFreshAccessToken === 'function' ? await sdk.getFreshAccessToken() : (await credentialVaultBridge.readLatest(connectorId))?.secret;
    if (!token) return { ok: false, code: 'not-connected', message: `${connectorId} is not connected. Connect it from Settings > Connections.` };
    return { ok: true, provider, token };
  }

  private failure(provider: McpProviderDefinition, error: unknown): McpGatewayFailure {
    const failure = error instanceof McpError ? error : new McpError('unavailable', `Unexpected ${provider.serverName} failure.`);
    this.client(provider).dropSession();
    const code: McpGatewayFailureCode = failure.kind === 'no-read-tool' ? 'tool-not-offered' : failure.kind;
    return { ok: false, code, message: `${failure.message} Use the existing ${provider.connectorId} connector actions instead.` };
  }

  /** The read tools PawOS may call for this connector right now: allowlisted, offered by the server, and safe. */
  async listReadTools(connectorId: string): Promise<McpListToolsResult> {
    const authorized = await this.authorize(connectorId);
    if (!authorized.ok) return authorized;
    const { provider, token } = authorized;
    try {
      const offered = await this.client(provider).listTools(token);
      const tools = offered
        .filter((tool) => provider.readTools.includes(tool.name) && isSafeReadTool(tool))
        .map((tool) => ({ name: tool.name, arguments: tool.inputProperties.filter((name) => /^[A-Za-z0-9_.-]{1,64}$/.test(name)) }));
      return { ok: true, connectorId, serverName: provider.serverName, tools };
    } catch (error) {
      return this.failure(provider, error);
    }
  }

  /** Calls one allowlisted read tool. Never mutates anything at the provider. */
  async callReadTool(connectorId: string, tool: string, args: unknown): Promise<McpCallResult> {
    const provider = getMcpProvider(connectorId);
    // Checked before any credential is touched or any request is made.
    if (provider && !provider.readTools.includes(tool)) {
      return { ok: false, code: 'tool-not-allowed', message: `'${tool}' is not an allowed read tool for ${provider.serverName}.` };
    }
    const authorized = await this.authorize(connectorId);
    if (!authorized.ok) return authorized;
    const { token } = authorized;
    const definition = authorized.provider;

    const input = args === undefined || args === null ? {} : args;
    if (!isObject(input) || JSON.stringify(input).length > MAX_ARGUMENT_CHARS) {
      return { ok: false, code: 'invalid-arguments', message: 'Tool arguments must be a small JSON object.' };
    }

    try {
      const client = this.client(definition);
      const offered = (await client.listTools(token)).find((candidate) => candidate.name === tool);
      if (!offered) return { ok: false, code: 'tool-not-offered', message: `${definition.serverName} does not offer '${tool}'. Use the existing ${connectorId} connector actions.` };
      if (!isSafeReadTool(offered)) {
        return { ok: false, code: 'tool-not-allowed', message: `${definition.serverName} does not mark '${tool}' as read-only, so it was not called.` };
      }
      const result = await client.callTool(token, tool, input);
      if (isObject(result) && result.isError === true) {
        return { ok: false, code: 'unavailable', message: `${definition.serverName} reported an error for '${tool}'. Use the existing ${connectorId} connector actions.` };
      }
      const text = resultText(result);
      if (text === undefined) return { ok: false, code: 'malformed', message: `${definition.serverName} returned nothing readable for '${tool}'. Use the existing ${connectorId} connector actions.` };
      return { ok: true, connectorId, tool, source: 'mcp', untrusted: true, content: text.slice(0, MAX_CONTENT_CHARS), truncated: text.length > MAX_CONTENT_CHARS };
    } catch (error) {
      return this.failure(definition, error);
    }
  }

  /** Per-connector MCP state for the Connections UI. Never includes a credential. */
  async status(): Promise<Array<{ connectorId: string; serverName: string; auth: McpProviderDefinition['auth']; entitled: boolean; mcpSignedIn: boolean; requirement?: string; callableTools: number }>> {
    const rows = [];
    for (const provider of Object.values(MCP_PROVIDERS)) {
      rows.push({
        connectorId: provider.connectorId,
        serverName: provider.serverName,
        auth: provider.auth,
        entitled: isConnectorEntitled(provider.connectorId),
        mcpSignedIn: provider.auth === 'mcpSignIn' ? await mcpOAuthFlow.isConnected(provider.connectorId) : false,
        requirement: provider.requirement,
        callableTools: provider.readTools.length,
      });
    }
    return rows;
  }

  /** Forgets cached sessions for a connector (called when it disconnects). */
  reset(connectorId: string): void {
    this.clients.get(connectorId)?.dropSession();
    this.clients.delete(connectorId);
  }
}

export const connectorMcpGateway = new ConnectorMcpGateway();
