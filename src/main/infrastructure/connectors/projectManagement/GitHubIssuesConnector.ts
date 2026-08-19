import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

const GITHUB_API = 'https://api.github.com';

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: Array<{ name: string } | string>;
  assignees?: Array<{ login: string }>;
  user?: { login: string } | null;
  repository_url?: string;
};

/** GitHub Issues has no native priority or due-date concept — never inferred/guessed from labels
 *  or text; those two fields are honestly left undefined for every GitHub-sourced ticket. */
function toTicket(issue: GitHubIssue, repoFallback: string): InfraTicket {
  const repo = issue.repository_url ? (issue.repository_url.split('/repos/')[1] ?? repoFallback) : repoFallback;
  return {
    id: `${repo}#${issue.number}`,
    title: issue.title,
    description: issue.body ?? '',
    url: issue.html_url,
    status: issue.state,
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    assignee: issue.assignees?.[0]?.login,
    reporter: issue.user?.login ?? undefined,
  };
}

/**
 * Real GitHub Issues connector, reusing the same GITHUB_TOKEN as source
 * control. Ticket ids are "owner/repo#123" so this connector can resolve an
 * issue without a separately-configured default repository.
 */
export class GitHubIssuesConnector implements ProjectManagementConnector {
  readonly id = 'githubIssues' as const;
  readonly displayName = 'GitHub Issues';

  constructor(private token: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'GitHub Issues is not configured. Add GITHUB_TOKEN to .env to connect it.' };
  }

  private headers(): Record<string, string> {
    return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  }

  private parseTicketId(ticketId: string): { repo: string; number: string } | null {
    const match = ticketId.match(/^(.+\/.+)#(\d+)$/);
    if (!match) return null;
    return { repo: match[1] as string, number: match[2] as string };
  }

  async getTicket(ticketId: string): Promise<ConnectorResult<{ ticket: InfraTicket }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const parsed = this.parseTicketId(ticketId);
    if (!parsed) return { ok: false, reason: `"${ticketId}" isn't a recognized GitHub issue reference — use "owner/repo#123".` };
    try {
      const res = await fetch(`${GITHUB_API}/repos/${parsed.repo}/issues/${parsed.number}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for ${ticketId}` };
      const issue = (await res.json()) as GitHubIssue;
      return { ok: true, ticket: toTicket(issue, parsed.repo) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async searchTickets(query: string): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const params = new URLSearchParams({ q: `${query} in:title,body is:issue`, per_page: '20' });
      const res = await fetch(`${GITHUB_API}/search/issues?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for search` };
      const data = (await res.json()) as { items: GitHubIssue[] };
      return { ok: true, tickets: data.items.map((issue) => toTicket(issue, '')) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /** `assignee:@me` is GitHub's own token-relative filter — resolved server-side against whichever
   *  account the connected token belongs to, never a locally-guessed username. Spans every repo
   *  the token can see, matching how a user actually thinks about "my issues." */
  async listMyTickets(): Promise<ConnectorResult<{ tickets: InfraTicket[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const params = new URLSearchParams({ q: 'is:issue is:open assignee:@me', per_page: '50' });
      const res = await fetch(`${GITHUB_API}/search/issues?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for assigned-issue search` };
      const data = (await res.json()) as { items: GitHubIssue[] };
      return { ok: true, tickets: data.items.map((issue) => toTicket(issue, '')) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
