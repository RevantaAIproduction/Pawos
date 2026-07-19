import type { CiCdConnector, ConnectorResult, InfraCiCdRun } from '../../../../shared/infrastructure/InfrastructureTypes';

const GITHUB_API = 'https://api.github.com';

/** Real GitHub Actions status connector — reuses the same GITHUB_TOKEN as source control. */
export class GitHubActionsConnector implements CiCdConnector {
  readonly id = 'githubActions' as const;
  readonly displayName = 'GitHub Actions';

  constructor(private token: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async getLatestRunStatus(repo: string, branch?: string): Promise<ConnectorResult<InfraCiCdRun>> {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'GitHub Actions is not configured. Add GITHUB_TOKEN to .env to connect it.' };
    }
    try {
      const params = new URLSearchParams({ per_page: '1' });
      if (branch) params.set('branch', branch);
      const res = await fetch(`${GITHUB_API}/repos/${repo}/actions/runs?${params.toString()}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) return { ok: false, reason: `GitHub Actions API returned ${res.status} for ${repo}` };
      const data = (await res.json()) as {
        workflow_runs: Array<{ status: string; conclusion: string | null; html_url: string; run_started_at: string; updated_at: string }>;
      };
      const run = data.workflow_runs[0];
      if (!run) return { ok: false, reason: `${repo} has no workflow runs${branch ? ` on ${branch}` : ''}.` };
      const status: InfraCiCdRun['status'] =
        run.status !== 'completed'
          ? (run.status as 'in_progress' | 'queued') === 'queued'
            ? 'pending'
            : 'running'
          : run.conclusion === 'success'
            ? 'success'
            : run.conclusion === 'cancelled'
              ? 'cancelled'
              : 'failure';
      return { ok: true, status, url: run.html_url, startedAt: run.run_started_at, completedAt: run.status === 'completed' ? run.updated_at : undefined };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitHub Actions: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
