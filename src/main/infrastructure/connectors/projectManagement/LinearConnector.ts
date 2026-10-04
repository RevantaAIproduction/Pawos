import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';
import type { LinearMcpReadTransport } from './LinearMcpReadTransport';

const LINEAR_API = 'https://api.linear.app/graphql';

/**
 * Linear takes a personal API key (`lin_api_…`, e.g. LINEAR_API_KEY in .env) as the raw header value,
 * but an OAuth access token (the Linear connector) only as `Bearer <token>`.
 */
export function linearAuthorization(token: string): string {
  if (!token) return '';
  return token.startsWith('lin_api_') ? token : `Bearer ${token}`;
}

type LinearIssueNode = {
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { name: string };
  labels: { nodes: { name: string }[] };
  priorityLabel?: string | null;
  dueDate?: string | null;
  assignee?: { name: string } | null;
  creator?: { name: string } | null;
};

const ISSUE_FIELDS = 'identifier title description url state { name } labels { nodes { name } } priorityLabel dueDate assignee { name } creator { name }';

function toTicket(node: LinearIssueNode): InfraTicket {
  return {
    id: node.identifier,
    title: node.title,
    description: node.description ?? '',
    url: node.url,
    status: node.state?.name,
    labels: node.labels?.nodes?.map((l) => l.name) ?? [],
    // Real Linear fields — priorityLabel is Linear's own human-readable priority string ("Urgent"/
    // "High"/"Medium"/"Low"/"No priority", never inferred); creator is who filed the issue (reporter).
    priority: node.priorityLabel && node.priorityLabel !== 'No priority' ? node.priorityLabel : undefined,
    dueDate: node.dueDate ?? undefined,
    assignee: node.assignee?.name,
    reporter: node.creator?.name,
  };
}

export interface LinearConnectorOptions {
  /** Supplies the current OAuth access token, refreshing it first when it is expired or about to
   *  be (LinearConnectorSDK owns that lifecycle). `forceRefresh` is set for the single retry after
   *  Linear rejects a token. Absent for a personal API key (LINEAR_API_KEY), which never expires. */
  getAccessToken?: (opts?: { forceRefresh?: boolean }) => Promise<string | undefined>;
  /** Linear's read-only Remote MCP server, tried first by listMyTickets(). Every other operation,
   *  and any MCP failure, uses the GraphQL API below. */
  mcp?: LinearMcpReadTransport;
}

/** Real Linear GraphQL API connector, with an optional read-only MCP transport in front of listMyTickets(). */
export class LinearConnector implements ProjectManagementConnector {
  readonly id = 'linear' as const;
  readonly displayName = 'Linear';

  constructor(private apiKey: string | undefined, private readonly options: LinearConnectorOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  setToken(token: string): void {
    this.apiKey = token;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Linear is not configured. Add LINEAR_API_KEY to .env to connect it.' };
  }

  private async currentToken(forceRefresh = false): Promise<string> {
    if (this.options.getAccessToken) {
      const token = await this.options.getAccessToken({ forceRefresh }).catch(() => undefined);
      if (token) return token;
    }
    return this.apiKey ?? '';
  }

  private post(token: string, gql: string, variables: Record<string, unknown>): Promise<Response> {
    return fetch(LINEAR_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: linearAuthorization(token) },
      body: JSON.stringify({ query: gql, variables }),
    });
  }

  private async query(gql: string, variables: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
    try {
      const token = await this.currentToken();
      let res = await this.post(token, gql, variables);
      // An OAuth access token Linear no longer accepts: refresh once and retry with the new one.
      if (res.status === 401 && this.options.getAccessToken) {
        const refreshed = await this.currentToken(true);
        if (refreshed && refreshed !== token) res = await this.post(refreshed, gql, variables);
      }
      if (!res.ok) return { ok: false, reason: `Linear API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const body = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
      if (body.errors?.length) return { ok: false, reason: `Linear API error: ${body.errors.map((e) => e.message).join('; ')}` };
      return { ok: true, data: body.data };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Linear: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getTicket(ticketId: string): Promise<ConnectorResult<{ ticket: InfraTicket }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await this.query(`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id: ticketId });
    if (!result.ok) return result;
    const data = result.data as { issue: LinearIssueNode | null };
    if (!data.issue) return { ok: false, reason: `Linear has no issue "${ticketId}".` };
    return { ok: true, ticket: toTicket(data.issue) };
  }

  async searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await this.query(`query($term: String!) { issueSearch(query: $term, first: 20) { nodes { ${ISSUE_FIELDS} } } }`, { term: query });
    if (!result.ok) return result;
    const data = result.data as { issueSearch: { nodes: LinearIssueNode[] } };
    return { ok: true, tickets: data.issueSearch.nodes.map(toTicket) };
  }

  /** `viewer` is Linear's own "who does this API key belong to" field — the assignee filter is
   *  resolved server-side against the connected account, never a locally-guessed user id. */
  async listMyTickets(): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (this.options.mcp) {
      try {
        return { ok: true, tickets: await this.options.mcp.listMyIssues(await this.currentToken()) };
      } catch {
        // MCP unavailable, unauthorized or malformed (the transport logs which) — callers get the
        // same answer from GraphQL below and never need to know which transport served it.
      }
    }
    const result = await this.query(`query { viewer { assignedIssues(first: 50) { nodes { ${ISSUE_FIELDS} } } } }`, {});
    if (!result.ok) return result;
    const data = result.data as { viewer: { assignedIssues: { nodes: LinearIssueNode[] } } };
    return { ok: true, tickets: data.viewer.assignedIssues.nodes.map(toTicket) };
  }
}
