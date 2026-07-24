import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

const LINEAR_API = 'https://api.linear.app/graphql';

type LinearIssueNode = { identifier: string; title: string; description: string | null; url: string; state: { name: string }; labels: { nodes: { name: string }[] } };

function toTicket(node: LinearIssueNode): InfraTicket {
  return {
    id: node.identifier,
    title: node.title,
    description: node.description ?? '',
    url: node.url,
    status: node.state?.name,
    labels: node.labels?.nodes?.map((l) => l.name) ?? [],
  };
}

/** Real Linear GraphQL API connector. */
export class LinearConnector implements ProjectManagementConnector {
  readonly id = 'linear' as const;
  readonly displayName = 'Linear';

  constructor(private apiKey: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  setToken(token: string): void {
    this.apiKey = token;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Linear is not configured. Add LINEAR_API_KEY to .env to connect it.' };
  }

  private async query(gql: string, variables: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; reason: string }> {
    try {
      const res = await fetch(LINEAR_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: this.apiKey ?? '' },
        body: JSON.stringify({ query: gql, variables }),
      });
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
    const result = await this.query(
      `query($id: String!) { issue(id: $id) { identifier title description url state { name } labels { nodes { name } } } }`,
      { id: ticketId }
    );
    if (!result.ok) return result;
    const data = result.data as { issue: LinearIssueNode | null };
    if (!data.issue) return { ok: false, reason: `Linear has no issue "${ticketId}".` };
    return { ok: true, ticket: toTicket(data.issue) };
  }

  async searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await this.query(
      `query($term: String!) { issueSearch(query: $term, first: 20) { nodes { identifier title description url state { name } labels { nodes { name } } } } }`,
      { term: query }
    );
    if (!result.ok) return result;
    const data = result.data as { issueSearch: { nodes: LinearIssueNode[] } };
    return { ok: true, tickets: data.issueSearch.nodes.map(toTicket) };
  }
}
