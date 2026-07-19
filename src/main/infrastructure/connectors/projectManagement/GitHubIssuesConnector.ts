import type { ConnectorResult, InfraTicket, ProjectManagementConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

const GITHUB_API = 'https://api.github.com';

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
      const issue = (await res.json()) as { number: number; title: string; body: string | null; html_url: string; state: string; labels: Array<{ name: string } | string> };
      return {
        ok: true,
        ticket: {
          id: `${parsed.repo}#${issue.number}`,
          title: issue.title,
          description: issue.body ?? '',
          url: issue.html_url,
          status: issue.state,
          labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
        },
      };
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
      const data = (await res.json()) as { items: Array<{ number: number; title: string; body: string | null; html_url: string; state: string; repository_url: string; labels: Array<{ name: string } | string> }> };
      return {
        ok: true,
        tickets: data.items.map((issue) => {
          const repo = issue.repository_url.split('/repos/')[1] ?? '';
          return {
            id: `${repo}#${issue.number}`,
            title: issue.title,
            description: issue.body ?? '',
            url: issue.html_url,
            status: issue.state,
            labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name)),
          };
        }),
      };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
