import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

const SFTP_TIMEOUT_MS = 10 * 60 * 1000;

function run(command: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: SFTP_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: (stdout + stderr).trim() });
    });
  });
}

/** Quotes a path for use inside an OpenSSH sftp batch file, where paths containing spaces must be double-quoted. */
function sftpQuote(p: string): string {
  return `"${p.replace(/"/g, '\\"')}"`;
}

/**
 * Real Hostinger connector for shared/business/cloud hosting plans, which
 * expose SFTP access but no deploy API or CLI. Deploys by shelling to the
 * standard OpenSSH `sftp` client in batch mode (never a new npm dependency —
 * confirmed no ssh2/basic-ftp package is already installed, and Windows 10+
 * ships `sftp.exe` in its built-in OpenSSH client, same as `ssh`/`scp` used
 * by DockerVpsConnector). Requires an SSH public key already added in
 * Hostinger's hPanel (Advanced -> SSH Access) — this connector never
 * handles a password itself, the same "already-authenticated CLI is the
 * trust boundary" rule as every other connector here.
 *
 * Plain SFTP has no deployment-history, rollback, or staging/production
 * concept, so getLatestDeployment/rollback/promote honestly report
 * unsupported rather than fabricating one.
 */
export class HostingerConnector implements HostingConnector {
  readonly id = 'hostinger' as const;
  readonly displayName = 'Hostinger';

  constructor(
    private host: string | undefined,
    private username: string | undefined,
    private remotePath: string | undefined, // e.g. "public_html"
    private port: string = '22',
    private siteUrl?: string // optional, purely for display in the returned deploy URL
  ) {}

  isConfigured(): boolean {
    return Boolean(this.host && this.username && this.remotePath);
  }

  private notConfigured(): { ok: false; reason: string } {
    return {
      ok: false,
      reason:
        'Hostinger is not configured. Set HOSTINGER_SFTP_HOST, HOSTINGER_SFTP_USER, and HOSTINGER_REMOTE_PATH, and add your SSH public key in hPanel -> Advanced -> SSH Access first.',
    };
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!fs.existsSync(projectPath)) {
      return { ok: false, reason: `Local path "${projectPath}" does not exist — nothing to upload.` };
    }

    let entries: string[];
    try {
      entries = fs.readdirSync(projectPath);
    } catch (error) {
      return { ok: false, reason: `Could not read "${projectPath}": ${error instanceof Error ? error.message : String(error)}` };
    }
    if (entries.length === 0) {
      return { ok: false, reason: `"${projectPath}" is empty — nothing to upload.` };
    }

    const lines = [`cd ${sftpQuote(this.remotePath as string)}`, `lcd ${sftpQuote(projectPath)}`];
    for (const entry of entries) {
      lines.push(`put -r ${sftpQuote(entry)}`);
    }
    lines.push('bye');

    const batchFile = path.join(os.tmpdir(), `pawos-hostinger-${Date.now()}.batch`);
    fs.writeFileSync(batchFile, lines.join('\n'), 'utf-8');

    try {
      const result = await run('sftp', [
        '-oStrictHostKeyChecking=accept-new',
        '-oBatchMode=yes',
        '-P',
        this.port,
        '-b',
        batchFile,
        `${this.username}@${this.host}`,
      ]);
      if (!result.ok) return { ok: false, reason: `Hostinger SFTP upload failed: ${result.message}` };
      return {
        ok: true,
        deploymentUrl: this.siteUrl ?? `sftp://${this.host}${this.remotePath?.startsWith('/') ? '' : '/'}${this.remotePath}`,
        deploymentId: `sftp-${Date.now()}`,
      };
    } finally {
      fs.unlink(batchFile, () => {});
    }
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    return { ok: false, reason: 'Plain SFTP hosting has no deployment history to query — Hostinger shared/business plans expose no deploy API.' };
  }

  async rollback(): Promise<ConnectorResult<{ rolledBack?: true }>> {
    return { ok: false, reason: 'Plain SFTP hosting has no rollback mechanism — re-run deploy with the previous build output instead.' };
  }

  async promote(): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    return { ok: false, reason: 'Hostinger SFTP hosting has no separate staging/production slot to promote between.' };
  }
}
