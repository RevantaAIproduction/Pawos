import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

type JiraDescriptionNode = { type?: string; text?: string; content?: JiraDescriptionNode[] };

type JiraIssue = {
  key: string;
  fields: {
    summary: string;
    description?: JiraDescriptionNode | string;
    status?: { name: string };
    labels?: string[];
    priority?: { name: string };
    duedate?: string | null;
    assignee?: { displayName: string } | null;
    reporter?: { displayName: string } | null;
  };
};

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

/** Either the legacy basic-auth credential (account email + API token, still supported for any
 *  caller that hasn't migrated) or a real Atlassian OAuth 2.0 (3LO) access token — see
 *  JiraConnectorSDK.ts, which now exclusively uses the 'bearer' mode. `baseUrl` differs by mode:
 *  a site's own URL (https://yourteam.atlassian.net) for 'basic', or Atlassian's
 *  cloudId-addressed proxy (https://api.atlassian.com/ex/jira/{cloudId}) for 'bearer' — see
 *  https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/. */
export type JiraAuthCredential = { mode: 'basic'; email: string; apiToken: string } | { mode: 'bearer'; accessToken: string };

/** Real Jira Cloud REST API connector — basic auth (account email + API token) or Atlassian OAuth 2.0 bearer token. */
export class JiraConnector implements ProjectManagementConnector {
  readonly id = 'jira' as const;
  readonly displayName = 'Jira';

  constructor(private baseUrl: string | undefined, private credential: JiraAuthCredential | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.credential);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Jira is not connected — connect it from Settings > Connections.' };
  }

  private headers(): Record<string, string> {
    if (this.credential?.mode === 'bearer') {
      return { Authorization: `Bearer ${this.credential.accessToken}`, Accept: 'application/json' };
    }
    const basic = this.credential?.mode === 'basic' ? Buffer.from(`${this.credential.email}:${this.credential.apiToken}`).toString('base64') : '';
    return { Authorization: `Basic ${basic}`, Accept: 'application/json' };
  }

  private toTicket(issue: JiraIssue): InfraTicket {
    return {
      id: issue.key,
      title: issue.fields.summary,
      description: flattenDescription(issue.fields.description),
      url: `${(this.baseUrl ?? '').replace(/\/+$/, '')}/browse/${issue.key}`,
      status: issue.fields.status?.name,
      labels: issue.fields.labels ?? [],
      // Real Jira fields, present in every standard issue payload (no extra `fields` request
      // param needed) — never inferred or guessed. A ticket genuinely lacking one of these
      // (no priority scheme, no due date set, unassigned) honestly comes back undefined.
      priority: issue.fields.priority?.name,
      dueDate: issue.fields.duedate ?? undefined,
      assignee: issue.fields.assignee?.displayName,
      reporter: issue.fields.reporter?.displayName,
    };
  }

  async getTicket(ticketId: string): Promise<ConnectorResult<{ ticket: InfraTicket }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${(this.baseUrl ?? '').replace(/\/+$/, '')}/rest/api/3/issue/${encodeURIComponent(ticketId)}`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, reason: `Jira API returned ${res.status} for ${ticketId}` };
      const issue = (await res.json()) as JiraIssue;
      return { ok: true, ticket: this.toTicket(issue) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Jira: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** Atlassian sunset `GET /rest/api/3/search` (returns 410 Gone as of May 2025) in favor of the
   *  Enhanced JQL endpoint, `POST /rest/api/3/search/jql` — same JQL semantics, same issue shape,
   *  just a POST body instead of query params. Shared by searchTickets/listMyTickets below. */
  private async runJqlSearch(jql: string, maxResults: number): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    try {
      const res = await fetch(`${(this.baseUrl ?? '').replace(/\/+$/, '')}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ jql, maxResults, fields: ['summary', 'description', 'status', 'labels', 'priority', 'duedate', 'assignee', 'reporter'] }),
      });
      if (!res.ok) return { ok: false, reason: `Jira API returned ${res.status} for search` };
      const data = (await res.json()) as { issues: JiraIssue[] };
      return { ok: true, tickets: data.issues.map((issue) => this.toTicket(issue)) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Jira: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const jql = `text ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
    return this.runJqlSearch(jql, 20);
  }

  /** `currentUser()` is a real Jira JQL function resolved server-side against whichever account
   *  the connected token belongs to — never a locally-guessed username/accountId. */
  async listMyTickets(): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const jql = 'assignee = currentUser() ORDER BY updated DESC';
    return this.runJqlSearch(jql, 50);
  }
}
