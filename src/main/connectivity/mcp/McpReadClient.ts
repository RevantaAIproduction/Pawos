/**
 * A small client for a provider's official Remote MCP server (Streamable HTTP, JSON-RPC 2.0),
 * shared by every connector that reads through MCP. It speaks only what PawOS needs:
 * initialize → notifications/initialized → tools/list, and tools/call.
 *
 * It enforces nothing about which tools are safe — that is each connector's job (an explicit
 * read-tool allowlist, see LinearMcpReadTransport). What it does guarantee:
 *  - The access token is sent only in the Authorization header and is never logged.
 *  - A tool can only be called if the server listed it in this session.
 *  - Everything the server returns is handed back as untrusted data; nothing is interpreted here.
 */

const PROTOCOL_VERSION = '2025-06-18';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOOL_PAGES = 5;

export type McpFailureKind = 'unauthorized' | 'unavailable' | 'malformed' | 'no-read-tool';

export class McpError extends Error {
  constructor(readonly kind: McpFailureKind, message: string) {
    super(message);
    this.name = 'McpError';
  }
}

/** What PawOS reads from a `tools/list` entry. Descriptions are deliberately not carried. */
export interface McpTool {
  name: string;
  /** Property names of the tool's input schema. */
  inputProperties: string[];
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTool(raw: unknown): McpTool | null {
  if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name) return null;
  const schema = isObject(raw.inputSchema) ? raw.inputSchema : {};
  const annotations = isObject(raw.annotations) ? raw.annotations : {};
  return {
    name: raw.name,
    inputProperties: isObject(schema.properties) ? Object.keys(schema.properties) : [],
    readOnlyHint: typeof annotations.readOnlyHint === 'boolean' ? annotations.readOnlyHint : undefined,
    destructiveHint: typeof annotations.destructiveHint === 'boolean' ? annotations.destructiveHint : undefined,
  };
}

interface McpSession {
  token: string;
  sessionId?: string;
  protocolVersion: string;
  tools?: McpTool[];
}

export class McpReadClient {
  private session: McpSession | undefined;
  private nextId = 1;

  /** `serverName` is only used in error messages, e.g. "Linear MCP". */
  constructor(private readonly endpoint: string, private readonly serverName: string) {}

  /** True when an initialized session with a tool list is cached for this token. */
  hasOpenSession(token: string): boolean {
    return this.session?.token === token && this.session.tools !== undefined;
  }

  dropSession(): void {
    this.session = undefined;
  }

  private headers(token: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    };
    if (this.session?.token === token) {
      headers['MCP-Protocol-Version'] = this.session.protocolVersion;
      if (this.session.sessionId) headers['Mcp-Session-Id'] = this.session.sessionId;
    }
    return headers;
  }

  private async send(token: string, body: JsonObject): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new McpError('unavailable', `Could not reach the ${this.serverName} server.`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new McpError('unauthorized', `${this.serverName} rejected the access token (HTTP ${res.status}).`);
    }
    if (!res.ok) throw new McpError('unavailable', `${this.serverName} returned HTTP ${res.status}.`);
    return res;
  }

  /** One JSON-RPC request. The server may answer as plain JSON or as an SSE stream of messages. */
  private async request(token: string, method: string, params: JsonObject): Promise<{ result: unknown; response: Response }> {
    const id = this.nextId++;
    const response = await this.send(token, { jsonrpc: '2.0', id, method, params });
    let message: unknown;
    try {
      if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
        for (const event of (await response.text()).split(/\r?\n\r?\n/)) {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          const parsed: unknown = JSON.parse(data);
          if (isObject(parsed) && parsed.id === id) message = parsed;
        }
      } else {
        message = await response.json();
      }
    } catch {
      throw new McpError('malformed', `${this.serverName} sent an unreadable response to ${method}.`);
    }
    if (!isObject(message) || message.id !== id) throw new McpError('malformed', `${this.serverName} sent no response for ${method}.`);
    if (message.error !== undefined) throw new McpError('unavailable', `${this.serverName} returned an error for ${method}.`);
    return { result: message.result, response };
  }

  /** The server's tools for this token. Opens (initialize → initialized → tools/list) on first use. */
  async listTools(token: string): Promise<McpTool[]> {
    if (!token) throw new McpError('unauthorized', 'No access token.');
    if (this.session?.token === token && this.session.tools) return this.session.tools;

    this.session = undefined;
    const { result, response } = await this.request(token, 'initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'pawos', version: '1' },
    });
    if (!isObject(result) || typeof result.protocolVersion !== 'string') {
      throw new McpError('malformed', `${this.serverName} initialize returned no protocol version.`);
    }
    const session: McpSession = { token, sessionId: response.headers.get('mcp-session-id') ?? undefined, protocolVersion: result.protocolVersion };
    this.session = session;
    await this.send(token, { jsonrpc: '2.0', method: 'notifications/initialized' });

    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const listed = (await this.request(token, 'tools/list', cursor ? { cursor } : {})).result;
      if (!isObject(listed) || !Array.isArray(listed.tools)) throw new McpError('malformed', `${this.serverName} tools/list returned no tool list.`);
      for (const raw of listed.tools) {
        const tool = toTool(raw);
        if (tool) tools.push(tool);
      }
      cursor = typeof listed.nextCursor === 'string' && listed.nextCursor ? listed.nextCursor : undefined;
      if (!cursor) break;
    }
    session.tools = tools;
    return tools;
  }

  /** Calls a tool the server listed. Returns the raw `tools/call` result — untrusted data. */
  async callTool(token: string, name: string, args: JsonObject): Promise<unknown> {
    const tools = await this.listTools(token);
    if (!tools.some((tool) => tool.name === name)) {
      throw new McpError('no-read-tool', `${this.serverName} does not list a tool named '${name}'.`);
    }
    return (await this.request(token, 'tools/call', { name, arguments: args })).result;
  }
}
