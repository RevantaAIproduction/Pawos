import type { CiCdConnector, ConnectorResult, InfraCiCdRun } from '../../../../shared/infrastructure/InfrastructureTypes';

/** Real GitLab CI/CD pipeline status connector — reuses the same GITLAB_TOKEN/GITLAB_URL as source control. */
export class GitLabCiConnector implements CiCdConnector {
  readonly id = 'gitlabCi' as const;
  readonly displayName = 'GitLab CI/CD';

  constructor(private token: string | undefined, private baseUrl: string = 'https://gitlab.com') {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private api(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/api/v4`;
  }

  async getLatestRunStatus(repo: string, branch?: string): Promise<ConnectorResult<InfraCiCdRun>> {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'GitLab CI/CD is not configured. Add GITLAB_TOKEN to .env to connect it.' };
    }
    try {
      const projectId = encodeURIComponent(repo);
      const params = new URLSearchParams({ per_page: '1', order_by: 'updated_at' });
      if (branch) params.set('ref', branch);
      const res = await fetch(`${this.api()}/projects/${projectId}/pipelines?${params.toString()}`, {
        headers: { 'PRIVATE-TOKEN': this.token ?? '' },
      });
      if (!res.ok) return { ok: false, reason: `GitLab CI/CD API returned ${res.status} for ${repo}` };
      const data = (await res.json()) as Array<{ status: string; web_url: string; created_at: string; updated_at: string }>;
      const pipeline = data[0];
      if (!pipeline) return { ok: false, reason: `${repo} has no pipelines${branch ? ` on ${branch}` : ''}.` };
      const statusMap: Record<string, InfraCiCdRun['status']> = {
        success: 'success',
        failed: 'failure',
        running: 'running',
        pending: 'pending',
        created: 'pending',
        canceled: 'cancelled',
        cancelled: 'cancelled',
      };
      const status = statusMap[pipeline.status] ?? 'unknown';
      return {
        ok: true,
        status,
        url: pipeline.web_url,
        startedAt: pipeline.created_at,
        completedAt: status === 'success' || status === 'failure' ? pipeline.updated_at : undefined,
      };
    } catch (error) {
      return { ok: false, reason: `Failed to reach GitLab CI/CD: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
