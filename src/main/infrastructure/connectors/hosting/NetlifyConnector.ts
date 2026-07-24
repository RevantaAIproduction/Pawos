import { execFile } from 'child_process';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const NETLIFY_API = 'https://api.netlify.com/api/v1';
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
 * Real Netlify connector. `deploy` shells out to the official Netlify CLI
 * (via npx netlify-cli) — same "never invent deployment infrastructure"
 * discipline as RunDeployScriptPlugin/VercelConnector. `getLatestDeployment`/
 * `rollback` need a linked site id (NETLIFY_SITE_ID) since Netlify's REST API
 * is scoped per-site, not per-account — honestly unavailable without one.
 */
export class NetlifyConnector implements HostingConnector {
  readonly id = 'netlify' as const;
  readonly displayName = 'Netlify';

  constructor(private token: string | undefined, private siteId: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  setToken(token: string): void {
    this.token = token;
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Netlify is not configured. Add NETLIFY_TOKEN to .env to connect it.' };
  }

  async deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = ['netlify-cli', 'deploy', '--dir', projectPath, '--auth', this.token ?? '', '--json'];
    if (opts?.prod) args.push('--prod');
    if (this.siteId) args.push('--site', this.siteId);
    const result = await run(args);
    if (!result.ok) return { ok: false, reason: `Netlify deploy failed: ${result.message}` };
    try {
      const jsonStart = result.stdout.indexOf('{');
      const parsed = JSON.parse(result.stdout.slice(jsonStart)) as { deploy_url?: string; deploy_id?: string; site_id?: string };
      if (!parsed.deploy_url || !parsed.deploy_id) {
        return { ok: false, reason: `Netlify deploy finished but its output didn't include a deploy URL: ${result.stdout.slice(-300)}` };
      }
      return { ok: true, deploymentUrl: parsed.deploy_url, deploymentId: parsed.deploy_id };
    } catch {
      return { ok: false, reason: `Netlify deploy finished but its output couldn't be parsed: ${result.stdout.slice(-300)}` };
    }
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.siteId) {
      return { ok: false, reason: 'This needs NETLIFY_SITE_ID in .env — deploy once first, or copy the site id from Netlify → Site settings → General.' };
    }
    try {
      const res = await fetch(`${NETLIFY_API}/sites/${this.siteId}/deploys?per_page=1`, { headers: { Authorization: `Bearer ${this.token}` } });
      if (!res.ok) return { ok: false, reason: `Netlify API returned ${res.status}: ${(await res.text()).slice(0, 300)}` };
      const data = (await res.json()) as Array<{ id: string; deploy_url: string; state: string; created_at: string }>;
      const deployment = data[0];
      if (!deployment) return { ok: false, reason: 'No deployments found for this Netlify site.' };
      return { ok: true, deploymentId: deployment.id, url: deployment.deploy_url, status: deployment.state, createdAt: deployment.created_at };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Netlify: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    return this.publishDeploy(deploymentId);
  }

  /**
   * Netlify's API is site-scoped, not deployment-scoped like Vercel's — the
   * same "restore" endpoint that republishes a prior deploy as live IS also
   * how you promote a preview deploy to production, since Netlify has no
   * separate rebuild-free "promote" concept. Real, shared implementation for
   * both rollback() and promote() rather than two names for one real call.
   */
  private async publishDeploy(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.siteId) {
      return { ok: false, reason: 'This needs NETLIFY_SITE_ID in .env to know which site to publish to.' };
    }
    try {
      const res = await fetch(`${NETLIFY_API}/sites/${this.siteId}/deploys/${deploymentId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return { ok: false, reason: `Netlify API returned ${res.status} publishing deploy ${deploymentId}: ${(await res.text()).slice(0, 300)}` };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: `Failed to reach Netlify: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    const result = await this.publishDeploy(deploymentId);
    if (!result.ok) return result;
    return { ok: true, deploymentUrl: `https://app.netlify.com/sites/${this.siteId}/deploys/${deploymentId}` };
  }
}
