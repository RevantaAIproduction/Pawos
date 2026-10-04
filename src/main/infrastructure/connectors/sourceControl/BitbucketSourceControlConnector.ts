import type { ConnectorResult, InfraCommit, InfraPullRequest, InfraRepository, SourceControlConnector } from '../../../../shared/infrastructure/InfrastructureTypes';

const BITBUCKET_API = 'https://api.bitbucket.org/2.0';

export interface BitbucketConnectorOptions {
  /** Supplies the current OAuth access token, refreshing it first when it is expired or about to
   *  be (BitbucketConnectorSDK owns that lifecycle — Bitbucket access tokens last about 2 hours).
   *  `forceRefresh` is set for the single retry after Bitbucket rejects a token. */
  getAccessToken?: (opts?: { forceRefresh?: boolean }) => Promise<string | undefined>;
}

/** `workspace/repo-slug`, each segment URL-encoded — never lets a repo name add path segments. */
function repoPath(repo: string): string {
  return repo.split('/').map(encodeURIComponent).join('/');
}

/** Real Bitbucket Cloud REST API (2.0) connector. `repo` is always `workspace/repo-slug`. */
export class BitbucketSourceControlConnector implements SourceControlConnector {
  readonly id = 'bitbucket' as const;
  readonly displayName = 'Bitbucket Cloud';

  constructor(private token: string | undefined, private readonly options: BitbucketConnectorOptions = {}) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Bitbucket is not connected. Connect it from Settings > Connections.' };
  }

  private async currentToken(forceRefresh = false): Promise<string> {
    if (this.options.getAccessToken) {
      const token = await this.options.getAccessToken({ forceRefresh }).catch(() => undefined);
      if (token) return token;
    }
    return this.token ?? '';
  }

  private async request(path: string, init: { method?: string; body?: unknown; accept?: string } = {}): Promise<Response> {
    const send = (token: string) =>
      fetch(`${BITBUCKET_API}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: init.accept ?? 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    const token = await this.currentToken();
    let res = await send(token);
    // An access token Bitbucket no longer accepts: refresh once and retry with the new one.
    if (res.status === 401 && this.options.getAccessToken) {
      const refreshed = await this.currentToken(true);
      if (refreshed && refreshed !== token) res = await send(refreshed);
    }
    return res;
  }

  private unreachable(error: unknown): { ok: false; reason: string } {
    return { ok: false, reason: `Failed to reach Bitbucket: ${error instanceof Error ? error.message : String(error)}` };
  }

  async listRepositories(): Promise<ConnectorResult<{ repos: InfraRepository[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await this.request('/repositories?role=member&pagelen=100&sort=-updated_on');
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as {
        values?: Array<{ name: string; full_name: string; mainbranch?: { name?: string } | null; links?: { html?: { href?: string } } }>;
      };
      return {
        ok: true,
        repos: (data.values ?? []).map((r) => ({
          name: r.name,
          fullName: r.full_name,
          defaultBranch: r.mainbranch?.name ?? 'main',
          url: r.links?.html?.href ?? `https://bitbucket.org/${r.full_name}`,
        })),
      };
    } catch (error) {
      return this.unreachable(error);
    }
  }

  async getFileContent(repo: string, path: string, ref?: string): Promise<ConnectorResult<{ content: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const filePath = path.split('/').map(encodeURIComponent).join('/');
      const res = await this.request(`/repositories/${repoPath(repo)}/src/${encodeURIComponent(ref ?? 'HEAD')}/${filePath}`, { accept: '*/*' });
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status} for ${repo}/${path}` };
      return { ok: true, content: await res.text() };
    } catch (error) {
      return this.unreachable(error);
    }
  }

  async getLatestCommit(repo: string, branch?: string): Promise<ConnectorResult<InfraCommit>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const target = branch ? `/${encodeURIComponent(branch)}` : '';
      const res = await this.request(`/repositories/${repoPath(repo)}/commits${target}?pagelen=1`);
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status} for ${repo} commits` };
      const data = (await res.json()) as { values?: Array<{ hash: string; message: string; date: string; author?: { raw?: string; user?: { display_name?: string } } }> };
      const first = data.values?.[0];
      if (!first) return { ok: false, reason: `${repo} has no commits on ${branch ?? 'its default branch'}.` };
      return { ok: true, sha: first.hash, message: first.message, author: first.author?.user?.display_name ?? first.author?.raw ?? 'unknown', date: first.date };
    } catch (error) {
      return this.unreachable(error);
    }
  }

  async listPullRequests(repo: string): Promise<ConnectorResult<{ pullRequests: InfraPullRequest[] }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await this.request(`/repositories/${repoPath(repo)}/pullrequests?pagelen=50&state=OPEN&state=MERGED&state=DECLINED&sort=-updated_on`);
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status} for ${repo} pull requests` };
      const data = (await res.json()) as {
        values?: Array<{
          id: number;
          title: string;
          state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
          author?: { display_name?: string; nickname?: string } | null;
          source?: { branch?: { name?: string } };
          destination?: { branch?: { name?: string } };
          links?: { html?: { href?: string } };
        }>;
      };
      const pullRequests: InfraPullRequest[] = (data.values ?? []).map((pr) => ({
        number: pr.id,
        title: pr.title,
        author: pr.author?.nickname ?? pr.author?.display_name ?? 'unknown',
        headBranch: pr.source?.branch?.name ?? '',
        baseBranch: pr.destination?.branch?.name ?? '',
        url: pr.links?.html?.href ?? `https://bitbucket.org/${repo}/pull-requests/${pr.id}`,
        state: pr.state === 'MERGED' ? 'merged' : pr.state === 'OPEN' ? 'open' : 'closed',
      }));
      return { ok: true, pullRequests };
    } catch (error) {
      return this.unreachable(error);
    }
  }

  async getPullRequestDiff(repo: string, prNumber: number): Promise<ConnectorResult<{ diff: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      // Bitbucket answers this with a redirect to the raw diff; fetch follows it.
      const res = await this.request(`/repositories/${repoPath(repo)}/pullrequests/${prNumber}/diff`, { accept: 'text/plain' });
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status} for ${repo}#${prNumber} diff` };
      return { ok: true, diff: await res.text() };
    } catch (error) {
      return this.unreachable(error);
    }
  }

  async createPullRequestComment(repo: string, prNumber: number, body: string): Promise<ConnectorResult<{ commentUrl?: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await this.request(`/repositories/${repoPath(repo)}/pullrequests/${prNumber}/comments`, { method: 'POST', body: { content: { raw: body } } });
      if (!res.ok) return { ok: false, reason: `Bitbucket API returned ${res.status} posting a comment on ${repo}#${prNumber}` };
      const data = (await res.json().catch(() => ({}))) as { links?: { html?: { href?: string } } };
      return { ok: true, commentUrl: data.links?.html?.href };
    } catch (error) {
      return this.unreachable(error);
    }
  }
}
