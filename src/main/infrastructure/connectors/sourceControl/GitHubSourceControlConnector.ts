import type { ConnectorResult, InfraCommit, InfraPullRequest, InfraRepository, SourceControlConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

const GITHUB_API = 'https://api.github.com';

/** Real GitHub REST API connector. Every method returns an honest {ok:false} — never fabricates a repo, file, or commit. */
export class GitHubSourceControlConnector implements SourceControlConnector {
  readonly id = 'github' as const;
  readonly displayName = 'GitHub';

  constructor(private token: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  /** Phase 6: lets an org-scoped credential (decrypted via
   * read_organization_credential) override the local .env token at
   * runtime, without changing anything else about how this connector works. */
  setToken(token: string): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'GitHub is not configured. Add GITHUB_TOKEN to .env to connect it.' };
  }

  async listRepositories(): Promise<ConnectorResult<{ repos: InfraRepository[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GITHUB_API}/user/repos?per_page=100&sort=updated`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as Array<{ name: string; full_name: string; default_branch: string; html_url: string }>;
      return { ok: true, repos: data.map((r) => ({ name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, url: r.html_url })) };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getFileContent(repo: string, path: string, ref?: string): Promise<ConnectorResult<{ content: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const params = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const res = await fetch(`${GITHUB_API}/repos/${repo}/contents/${encodeURIComponent(path)}${params}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for ${repo}/${path}` };
      const data = (await res.json()) as { content?: string; encoding?: string };
      if (!data.content) return { ok: false, reason: `${path} has no readable content (it may be a directory).` };
      const content = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf-8') : data.content;
      return { ok: true, content };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getLatestCommit(repo: string, branch?: string): Promise<ConnectorResult<InfraCommit>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const params = new URLSearchParams({ per_page: '1' });
      if (branch) params.set('sha', branch);
      const res = await fetch(`${GITHUB_API}/repos/${repo}/commits?${params.toString()}`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for ${repo} commits` };
      const data = (await res.json()) as Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }>;
      const first = data[0];
      if (!first) return { ok: false, reason: `${repo} has no commits on ${branch ?? 'its default branch'}.` };
      return { ok: true, sha: first.sha, message: first.commit.message, author: first.commit.author.name, date: first.commit.author.date };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async listPullRequests(repo: string): Promise<ConnectorResult<{ pullRequests: InfraPullRequest[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GITHUB_API}/repos/${repo}/pulls?state=all&per_page=50&sort=updated`, { headers: this.headers() });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for ${repo} pulls` };
      const data = (await res.json()) as Array<{
        number: number;
        title: string;
        user: { login: string } | null;
        head: { ref: string };
        base: { ref: string };
        html_url: string;
        state: 'open' | 'closed';
        merged_at: string | null;
      }>;
      const pullRequests: InfraPullRequest[] = data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? 'unknown',
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        url: pr.html_url,
        state: pr.merged_at ? 'merged' : pr.state,
      }));
      return { ok: true, pullRequests };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async getPullRequestDiff(repo: string, prNumber: number): Promise<ConnectorResult<{ diff: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GITHUB_API}/repos/${repo}/pulls/${prNumber}`, {
        headers: { ...this.headers(), Accept: 'application/vnd.github.v3.diff' },
      });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} for ${repo}#${prNumber} diff` };
      const diff = await res.text();
      return { ok: true, diff };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async createPullRequestComment(repo: string, prNumber: number, body: string): Promise<ConnectorResult<{ commentUrl?: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${GITHUB_API}/repos/${repo}/issues/${prNumber}/comments`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return { ok: false, reason: `GitHub API returned ${res.status} posting a comment on ${repo}#${prNumber}` };
      const data = (await res.json()) as { html_url?: string };
      return { ok: true, commentUrl: data.html_url };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
