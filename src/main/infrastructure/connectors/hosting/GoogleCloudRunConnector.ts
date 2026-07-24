import { execFile } from 'child_process';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000; // Cloud Run builds (Cloud Build) run longer than a CLI-side deploy

function run(args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('gcloud', args, { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: (stdout + stderr).trim() });
    });
  });
}

/**
 * Real Google Cloud Run connector. Unlike Vercel/Netlify/Railway, the
 * `gcloud` CLI is not an npm package — it's the user's own natively
 * installed, separately-authenticated CLI (same one GcpCliConnector already
 * detects). This connector shells directly to `gcloud run deploy --source`,
 * which builds the container via Cloud Build and deploys it in one command
 * — no Dockerfile required, matching Vercel/Netlify's "point at a folder"
 * simplicity as closely as a real GCP deploy path allows. Requires
 * GCP_PROJECT_ID and GCP_REGION (or gcloud's own configured defaults) plus
 * an already-authenticated `gcloud` session (`gcloud auth login` /
 * `gcloud auth application-default login`) — this connector never manages
 * credentials itself, exactly like the CLI-detect connectors' own discipline.
 */
export class GoogleCloudRunConnector implements HostingConnector {
  readonly id = 'googleCloudRun' as const;
  readonly displayName = 'Google Cloud Run';

  constructor(
    private serviceName: string | undefined,
    private projectId: string | undefined,
    private region: string = 'us-central1'
  ) {}

  isConfigured(): boolean {
    return Boolean(this.serviceName);
  }

  setServiceName(serviceName: string): void {
    this.serviceName = serviceName;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Google Cloud Run is not configured. Set GCP_CLOUD_RUN_SERVICE (and GCP_PROJECT_ID) to connect it, and make sure `gcloud auth login` has been run.' };
  }

  private projectArgs(): string[] {
    return this.projectId ? ['--project', this.projectId] : [];
  }

  async deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = [
      'run', 'deploy', this.serviceName as string,
      '--source', projectPath,
      '--region', this.region,
      '--platform', 'managed',
      '--quiet',
      ...(opts?.prod ? [] : ['--no-traffic']), // non-prod deploys land as a new revision without taking live traffic
      ...this.projectArgs(),
    ];
    const result = await run(args);
    if (!result.ok) return { ok: false, reason: `gcloud run deploy failed: ${result.message}` };
    const urlMatch = result.stdout.match(/https:\/\/\S+\.run\.app\S*/);
    const revisionMatch = result.stdout.match(/Revision \[([^\]]+)\]/);
    if (!urlMatch) return { ok: false, reason: `Cloud Run deploy finished but no service URL was found in its output: ${result.stdout.slice(-400)}` };
    return { ok: true, deploymentUrl: urlMatch[0], deploymentId: revisionMatch?.[1] ?? this.serviceName ?? 'unknown' };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run([
      'run', 'revisions', 'list',
      '--service', this.serviceName as string,
      '--region', this.region,
      '--limit', '1',
      '--sort-by', '~metadata.creationTimestamp',
      '--format', 'json',
      ...this.projectArgs(),
    ]);
    if (!result.ok) return { ok: false, reason: `gcloud run revisions list failed: ${result.message}` };
    try {
      const revisions = JSON.parse(result.stdout) as Array<{ metadata: { name: string; creationTimestamp: string }; status?: { conditions?: Array<{ type: string; status: string }> } }>;
      const revision = revisions[0];
      if (!revision) return { ok: false, reason: `No revisions found for Cloud Run service "${this.serviceName}".` };
      const ready = revision.status?.conditions?.find((c) => c.type === 'Ready');
      const serviceUrl = await run(['run', 'services', 'describe', this.serviceName as string, '--region', this.region, '--format', 'value(status.url)', ...this.projectArgs()]);
      return {
        ok: true,
        deploymentId: revision.metadata.name,
        url: serviceUrl.ok ? serviceUrl.stdout : '(unknown — describe the service in the GCP console)',
        status: ready?.status === 'True' ? 'ready' : (ready?.status ?? 'unknown'),
        createdAt: revision.metadata.creationTimestamp,
      };
    } catch {
      return { ok: false, reason: 'Could not parse gcloud run revisions list output.' };
    }
  }

  /** Cloud Run's real rollback mechanism: shift 100% of traffic to a named, already-deployed revision. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run([
      'run', 'services', 'update-traffic', this.serviceName as string,
      '--region', this.region,
      '--to-revisions', `${deploymentId}=100`,
      '--quiet',
      ...this.projectArgs(),
    ]);
    if (!result.ok) return { ok: false, reason: `gcloud run update-traffic failed: ${result.message}` };
    return { ok: true };
  }

  /** Promotes a no-traffic revision (from a non-prod deploy above) to receive 100% of live traffic. */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run([
      'run', 'services', 'update-traffic', this.serviceName as string,
      '--region', this.region,
      '--to-revisions', `${deploymentId}=100`,
      '--quiet',
      ...this.projectArgs(),
    ]);
    if (!result.ok) return { ok: false, reason: `gcloud run promote failed: ${result.message}` };
    const serviceUrl = await run(['run', 'services', 'describe', this.serviceName as string, '--region', this.region, '--format', 'value(status.url)', ...this.projectArgs()]);
    return { ok: true, deploymentUrl: serviceUrl.ok ? serviceUrl.stdout : deploymentId };
  }
}
