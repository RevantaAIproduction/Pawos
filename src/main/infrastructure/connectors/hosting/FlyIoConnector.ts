import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function run(args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('fly', args, { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}

/**
 * Real Fly.io connector. Shells to the official `flyctl` (`fly auth login`
 * must already be run). Requires a real `fly.toml` already in the project —
 * `fly launch`'s interactive app-scaffolding is a one-time setup step the
 * user runs themselves; PawOS never invents or runs it on their behalf,
 * matching every other connector's "never invent deployment
 * infrastructure" rule. Rollback deploys a previous release's already-built
 * image directly (`fly deploy --image`) rather than a dedicated rollback
 * subcommand, since that's the mechanism flyctl documents for returning to
 * an older, already-built version.
 */
export class FlyIoConnector implements HostingConnector {
  readonly id = 'flyio' as const;
  readonly displayName = 'Fly.io';

  constructor(private appName: string | undefined) {}

  isConfigured(): boolean {
    return Boolean(this.appName);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Fly.io is not configured. Set FLYIO_APP_NAME, and make sure `fly auth login` has been run and the project already has a fly.toml (from `fly launch`, run once by you).' };
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!fs.existsSync(path.join(projectPath, 'fly.toml'))) {
      return { ok: false, reason: `No fly.toml found at "${projectPath}". Run \`fly launch\` yourself once to scaffold it — PawOS never generates Fly app configuration on your behalf.` };
    }
    const result = await run(['deploy', '--config', path.join(projectPath, 'fly.toml'), '--app', this.appName as string]);
    if (!result.ok) return { ok: false, reason: `fly deploy failed: ${result.message}` };
    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : `https://${this.appName}.fly.dev`, deploymentId: latest.ok ? latest.deploymentId : 'unknown' };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const releases = await run(['releases', '--app', this.appName as string, '--json']);
    if (!releases.ok) return { ok: false, reason: `fly releases failed: ${releases.message}` };
    try {
      const data = JSON.parse(releases.stdout) as Array<{ Version?: number; Status?: string; CreatedAt?: string }>;
      const latest = data[0];
      if (!latest) return { ok: false, reason: `No releases found for Fly app ${this.appName}.` };
      return { ok: true, deploymentId: String(latest.Version ?? 'unknown'), url: `https://${this.appName}.fly.dev`, status: latest.Status ?? 'unknown', createdAt: latest.CreatedAt ?? new Date().toISOString() };
    } catch {
      return { ok: false, reason: 'Could not parse fly releases output.' };
    }
  }

  /** Re-deploys a previous release's already-built image — Fly's documented way to return to an older version. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['deploy', '--app', this.appName as string, '--image', `registry.fly.io/${this.appName}:deployment-${deploymentId}`]);
    if (!result.ok) return { ok: false, reason: `Rollback to release ${deploymentId} failed: ${result.message}` };
    return { ok: true };
  }

  async promote(): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    return { ok: false, reason: 'A single Fly app has no separate staging/production slot to promote between — deploy a second Fly app for staging if you need one.' };
  }
}
