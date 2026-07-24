import type { ConnectorResult, InfraCommit, InfraPullRequest, InfraRepository, SourceControlConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

/** Real GitLab REST API connector (gitlab.com or a self-managed instance via GITLAB_URL). */
export class GitLabSourceControlConnector implements SourceControlConnector {
  readonly id = 'gitlab' as const;
  readonly displayName = 'GitLab';

  constructor(private token: string | undefined, private baseUrl: string = 'https://gitlab.com') {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  setToken(token: string): void {
    this.token = token;
  }

  private api(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/v4`;
  }

  private headers(): Record<string, string> {
    return { 'PRIVATE-TOKEN': this.token ?? '' };
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'GitLab is not configured. Add GITLAB_TOKEN (and optionally GITLAB_URL) to .env to connect it.' };
  }

  async listRepositories(): Promise<ConnectorResult<{ repos: InfraRepository[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${this.api()}/projects?membership=true&per_page=100&order_by=last_activity_at`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as Array<{ name: string; path_with_namespace: string; default_branch: string; web_url: string }>;
      return { ok: true, repos: data.map((r) => ({ name: r.name, fullName: r.path_with_namespace, defaultBranch: r.default_branch, url: r.web_url })) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getFileContent(repo: string, path: string, ref?: string): Promise<ConnectorResult<{ content: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const projectId = encodeURIComponent(repo);
      const params = new URLSearchParams({ ref: ref ?? 'HEAD' });
      const res = await fetch(`${this.api()}/projects/${projectId}/repository/files/${encodeURIComponent(path)}?${params.toString()}`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status} for ${repo}/${path}` };
      const data = (await res.json()) as { content?: string; encoding?: string };
      if (!data.content) return { ok: false, reason: `${path} has no readable content.` };
      const content = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf-8') : data.content;
      return { ok: true, content };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getLatestCommit(repo: string, branch?: string): Promise<ConnectorResult<InfraCommit>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const projectId = encodeURIComponent(repo);
      const params = new URLSearchParams({ per_page: '1' });
      if (branch) params.set('ref_name', branch);
      const res = await fetch(`${this.api()}/projects/${projectId}/repository/commits?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status} for ${repo} commits` };
      const data = (await res.json()) as Array<{ id: string; message: string; author_name: string; authored_date: string }>;
      const first = data[0];
      if (!first) return { ok: false, reason: `${repo} has no commits on ${branch ?? 'its default branch'}.` };
      return { ok: true, sha: first.id, message: first.message, author: first.author_name, date: first.authored_date };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async listPullRequests(repo: string): Promise<ConnectorResult<{ pullRequests: InfraPullRequest[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const projectId = encodeURIComponent(repo);
      const res = await fetch(`${this.api()}/projects/${projectId}/merge_requests?scope=all&per_page=50&order_by=updated_at`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status} for ${repo} merge requests` };
      const data = (await res.json()) as Array<{
        iid: number;
        title: string;
        author: { username: string } | null;
        source_branch: string;
        target_branch: string;
        web_url: string;
        state: 'opened' | 'closed' | 'merged' | 'locked';
      }>;
      const pullRequests: InfraPullRequest[] = data.map((mr) => ({
        number: mr.iid,
        title: mr.title,
        author: mr.author?.username ?? 'unknown',
        headBranch: mr.source_branch,
        baseBranch: mr.target_branch,
        url: mr.web_url,
        state: mr.state === 'merged' ? 'merged' : mr.state === 'closed' ? 'closed' : 'open',
      }));
      return { ok: true, pullRequests };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getPullRequestDiff(repo: string, prNumber: number): Promise<ConnectorResult<{ diff: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const projectId = encodeURIComponent(repo);
      const res = await fetch(`${this.api()}/projects/${projectId}/merge_requests/${prNumber}/diffs?per_page=100`, {
        headers: this.headers(),
      });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status} for ${repo}!${prNumber} diffs` };
      const data = (await res.json()) as Array<{ old_path: string; new_path: string; diff: string }>;
      const diff = data
        .map((d) => `diff --git a/${d.old_path} b/${d.new_path}\n${d.diff}`)
        .join('\n');
      return { ok: true, diff };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async createPullRequestComment(repo: string, prNumber: number, body: string): Promise<ConnectorResult<{ commentUrl?: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const projectId = encodeURIComponent(repo);
      const res = await fetch(`${this.api()}/projects/${projectId}/merge_requests/${prNumber}/notes`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return { ok: false, reason: `GitLab API returned ${res.status} posting a comment on ${repo}!${prNumber}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
