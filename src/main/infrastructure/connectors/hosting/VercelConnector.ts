import { execFile } from 'child_process';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const VERCEL_API = 'https://api.vercel.com';
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

function run(args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('npx', args, { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1000) });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}

/**
 * Real Vercel connector. `deploy`/`rollback` shell out to the official
 * Vercel CLI (via npx) rather than reimplementing Vercel's file-upload
 * protocol — the same "never invent deployment infrastructure" discipline
 * as RunDeployScriptPlugin. `getLatestDeployment` is a direct, stable REST
 * call (no file upload involved).
 */
export class VercelConnector implements HostingConnector {
  readonly id = 'vercel' as const;
  readonly displayName = 'Vercel';

  constructor(private token: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  setToken(token: string): void {
    this.token = token;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Vercel is not configured. Add VERCEL_TOKEN to .env to connect it.' };
  }

  async deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = ['vercel', 'deploy', projectPath, '--token', this.token ?? '', '--yes'];
    if (opts?.prod) args.push('--prod');
    const result = await run(args);
    if (!result.ok) return { ok: false, reason: `Vercel deploy failed: ${result.message}` };
    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const urlLine = [...lines].reverse().find((l) => l.startsWith('https://'));
    if (!urlLine) return { ok: false, reason: `Vercel deploy finished but no deployment URL was found in its output: ${result.stdout.slice(-300)}` };
    return { ok: true, deploymentUrl: urlLine, deploymentId: urlLine.replace('https://', '').split('.')[0] ?? urlLine };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    try {
      const res = await fetch(`${VERCEL_API}/v6/deployments?limit=1`, { headers: { Authorization: `Bearer ${this.token}` } });
      if (!res.ok) return { ok: false, reason: `Vercel API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as { deployments: Array<{ uid: string; url: string; state: string; createdAt: number }> };
      const deployment = data.deployments[0];
      if (!deployment) return { ok: false, reason: 'No deployments found on this Vercel account.' };
      return { ok: true, deploymentId: deployment.uid, url: `https://${deployment.url}`, status: deployment.state, createdAt: new Date(deployment.createdAt).toISOString() };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Vercel: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['vercel', 'rollback', deploymentId, '--token', this.token ?? '', '--yes']);
    if (!result.ok) return { ok: false, reason: `Vercel rollback failed: ${result.message}` };
    return { ok: true };
  }

  /** Real Vercel CLI subcommand — promotes an existing (already-built) deployment to production without rebuilding. */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['vercel', 'promote', deploymentId, '--token', this.token ?? '', '--yes']);
    if (!result.ok) return { ok: false, reason: `Vercel promote failed: ${result.message}` };
    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const urlLine = [...lines].reverse().find((l) => l.startsWith('https://'));
    return { ok: true, deploymentUrl: urlLine ?? deploymentId };
  }
}
