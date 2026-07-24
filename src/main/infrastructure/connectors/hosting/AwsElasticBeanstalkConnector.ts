import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';
import { compressPaths } from '../../../execution/plugins/archiveUtils';

const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

function run(args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    execFile('aws', args, { timeout: DEPLOY_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, message: (stderr || error.message).trim().slice(-1500) });
        return;
      }
      resolve({ ok: true, stdout: stdout.trim() });
    });
  });
}

/**
 * Real AWS Elastic Beanstalk connector. Uses only the standard `aws` CLI
 * (the same one AwsCliConnector already detects) — never the separate,
 * Python-distributed `eb` CLI, so it needs no extra dependency beyond what
 * this project already requires for authenticated AWS access. Deploy flow
 * mirrors AWS's own documented S3-source-bundle pattern: zip the project
 * (via the `archiver` package already used elsewhere in this codebase),
 * upload it to the configured S3 bucket, register it as a new application
 * version, then point the environment at it — the real AWS equivalent of
 * Vercel/Netlify's "point at a folder and deploy."
 */
export class AwsElasticBeanstalkConnector implements HostingConnector {
  readonly id = 'awsElasticBeanstalk' as const;
  readonly displayName = 'AWS Elastic Beanstalk';

  constructor(
    private applicationName: string | undefined,
    private environmentName: string | undefined,
    private s3Bucket: string | undefined,
    private region: string = 'us-east-1'
  ) {}

  isConfigured(): boolean {
    return Boolean(this.applicationName && this.environmentName && this.s3Bucket);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'AWS Elastic Beanstalk is not configured. Set AWS_EB_APPLICATION, AWS_EB_ENVIRONMENT, and AWS_EB_S3_BUCKET, and make sure `aws configure`/`aws sso login` has been run.' };
  }

  async deploy(projectPath: string): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const versionLabel = `v-${Date.now()}`;
    const s3Key = `${this.applicationName}/${versionLabel}.zip`;
    const tmpZip = path.join(os.tmpdir(), `pawos-eb-${versionLabel}.zip`);

    // Reuses the same compressPaths() every file-lifecycle plugin already uses (archiveUtils.ts) rather than
    // a bespoke zip implementation; it has no built-in node_modules/.git exclusion, so a build step that
    // produces a clean output directory (dist/build) is the recommended deploy target for large projects.
    try {
      await compressPaths([projectPath], tmpZip);
    } catch (error) {
      return { ok: false, reason: `Failed to package project for upload: ${error instanceof Error ? error.message : String(error)}` };
    }

    const upload = await run(['s3', 'cp', tmpZip, `s3://${this.s3Bucket}/${s3Key}`, '--region', this.region]);
    fs.unlink(tmpZip, () => {});
    if (!upload.ok) return { ok: false, reason: `Upload to S3 failed: ${upload.message}` };

    const createVersion = await run([
      'elasticbeanstalk', 'create-application-version',
      '--application-name', this.applicationName as string,
      '--version-label', versionLabel,
      '--source-bundle', `S3Bucket=${this.s3Bucket},S3Key=${s3Key}`,
      '--region', this.region,
    ]);
    if (!createVersion.ok) return { ok: false, reason: `create-application-version failed: ${createVersion.message}` };

    const updateEnv = await run([
      'elasticbeanstalk', 'update-environment',
      '--environment-name', this.environmentName as string,
      '--version-label', versionLabel,
      '--region', this.region,
    ]);
    if (!updateEnv.ok) return { ok: false, reason: `update-environment failed: ${updateEnv.message}` };

    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : '(deployed — check the Elastic Beanstalk console)', deploymentId: versionLabel };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['elasticbeanstalk', 'describe-environments', '--environment-names', this.environmentName as string, '--region', this.region, '--output', 'json']);
    if (!result.ok) return { ok: false, reason: `describe-environments failed: ${result.message}` };
    try {
      const data = JSON.parse(result.stdout) as { Environments?: Array<{ VersionLabel: string; CNAME: string; Status: string; DateUpdated: string }> };
      const env = data.Environments?.[0];
      if (!env) return { ok: false, reason: `No Elastic Beanstalk environment named "${this.environmentName}" was found.` };
      return { ok: true, deploymentId: env.VersionLabel, url: `http://${env.CNAME}`, status: env.Status, createdAt: env.DateUpdated };
    } catch {
      return { ok: false, reason: 'Could not parse describe-environments output.' };
    }
  }

  /** Elastic Beanstalk's real rollback: re-point the environment at a previously-created application version. */
  async rollback(deploymentId: string): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['elasticbeanstalk', 'update-environment', '--environment-name', this.environmentName as string, '--version-label', deploymentId, '--region', this.region]);
    if (!result.ok) return { ok: false, reason: `Rollback failed: ${result.message}` };
    return { ok: true };
  }

  /** Elastic Beanstalk has no separate staging/production environment swap in this simple single-environment
   * setup — "promote" here re-applies the named version label, identical to rollback's mechanism. */
  async promote(deploymentId: string): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const result = await run(['elasticbeanstalk', 'update-environment', '--environment-name', this.environmentName as string, '--version-label', deploymentId, '--region', this.region]);
    if (!result.ok) return { ok: false, reason: `Promote failed: ${result.message}` };
    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : deploymentId };
  }
}
