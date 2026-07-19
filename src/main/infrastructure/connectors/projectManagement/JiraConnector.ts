import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

type JiraDescriptionNode = { type?: string; text?: string; content?: JiraDescriptionNode[] };

/** Best-effort flatten of Jira's Atlassian Document Format description into plain text — never fabricates content that isn't there. */
function flattenDescription(node: JiraDescriptionNode | string | null | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  let text = node.text ?? '';
  for (const child of node.content ?? []) {
    text += (text ? '\n' : '') + flattenDescription(child);
  }
  return text;
}

/** Real Jira Cloud REST API connector (basic auth: account email + API token). */
export class JiraConnector implements ProjectManagementConnector {
  readonly id = 'jira' as const;
  readonly displayName = 'Jira';

  constructor(private baseUrl: string | undefined, private email: string | undefined, private apiToken: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.email && this.apiToken);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Jira is not configured. Add JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN to .env to connect it.' };
  }

  private headers(): Record<string, string> {
    const basic = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return { Authorization: `Basic ${basic}`, Accept: 'application/json' };
  }

  private toTicket(issue: { key: string; fields: { summary: string; description?: JiraDescriptionNode | string; status?: { name: string }; labels?: string[] } }): InfraTicket {
    return {
      id: issue.key,
      title: issue.fields.summary,
      description: flattenDescription(issue.fields.description),
      url: `${(this.baseUrl ?? '').replace(/\/+$/, '')}/browse/${issue.key}`,
      status: issue.fields.status?.name,
      labels: issue.fields.labels ?? [],
    };
  }

  async getTicket(ticketId: string): Promise<ConnectorResult<{ ticket: InfraTicket }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${(this.baseUrl ?? '').replace(/\/+$/, '')}/rest/api/3/issue/${encodeURIComponent(ticketId)}`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, reason: `Jira API returned ${res.status} for ${ticketId}` };
      const issue = (await res.json()) as { key: string; fields: { summary: string; description?: JiraDescriptionNode; status?: { name: string }; labels?: string[] } };
      return { ok: true, ticket: this.toTicket(issue) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Jira: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const jql = `text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
      const params = new URLSearchParams({ jql, maxResults: '20' });
      const res = await fetch(`${(this.baseUrl ?? '').replace(/\/+$/, '')}/rest/api/3/search?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `Jira API returned ${res.status} for search` };
      const data = (await res.json()) as { issues: Array<{ key: string; fields: { summary: string; description?: JiraDescriptionNode; status?: { name: string }; labels?: string[] } }> };
      return { ok: true, tickets: data.issues.map((issue) => this.toTicket(issue)) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Jira: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
