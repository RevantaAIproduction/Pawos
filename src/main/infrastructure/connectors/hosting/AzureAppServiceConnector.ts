import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCli } from './vmProvisioning';
import { compressPaths } from '../../../execution/plugins/archiveUtils';
import type { ConnectorResult, HostingConnector, InfraDeployment } from '../../../../shared/infrastructure/InfrastructureTypes';

/**
 * Real Azure App Service connector — a managed PaaS target, distinct from
 * AzureVmConnector's raw VM. Ensures the resource group and App Service
 * Plan exist (both real, idempotent `az` calls), creates the web app if
 * needed, then deploys via Azure's real zip-deploy mechanism
 * (`az webapp deployment source config-zip`). Rollback/promote only have a
 * real mechanism when a staging deployment slot is configured
 * (AZURE_APP_SERVICE_STAGING_SLOT) — Azure's own slot-swap is genuinely
 * reversible (swapping again reverts a previous swap), so this connector
 * uses that rather than fabricating a rollback that doesn't exist for a
 * single-slot app.
 */
export class AzureAppServiceConnector implements HostingConnector {
  readonly id = 'azureAppService' as const;
  readonly displayName = 'Azure App Service';

  constructor(
    private appName: string | undefined,
    private resourceGroup: string | undefined,
    private location: string = 'eastus',
    private planSku: string = 'B1',
    private runtime: string = 'NODE|20-lts',
    private stagingSlot: string | undefined
  ) {}

  isConfigured(): boolean {
    return Boolean(this.appName && this.resourceGroup);
  }

  private notConfigured(): { ok: false; reason: string } {
    return { ok: false, reason: 'Azure App Service is not configured. Set AZURE_APP_SERVICE_NAME and AZURE_RESOURCE_GROUP, and make sure `az login` has been run.' };
  }

  private planName(): string {
    return `${this.appName}-plan`;
  }

  private async ensureAppExists(): Promise<ConnectorResult<Record<string, never>>> {
    const group = await runCli('az', ['group', 'create', '--name', this.resourceGroup as string, '--location', this.location, '--output', 'json']);
    if (!group.ok) return { ok: false, reason: `az group create failed: ${group.message}` };

    const plan = await runCli('az', ['appservice', 'plan', 'create', '--name', this.planName(), '--resource-group', this.resourceGroup as string, '--sku', this.planSku, '--is-linux', '--output', 'json']);
    if (!plan.ok) return { ok: false, reason: `az appservice plan create failed: ${plan.message}` };

    const app = await runCli('az', [
      'webapp', 'create',
      '--name', this.appName as string,
      '--resource-group', this.resourceGroup as string,
      '--plan', this.planName(),
      '--runtime', this.runtime,
      '--output', 'json',
    ]);
    if (!app.ok) return { ok: false, reason: `az webapp create failed: ${app.message}` };

    if (this.stagingSlot) {
      const slot = await runCli('az', ['webapp', 'deployment', 'slot', 'create', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--slot', this.stagingSlot, '--output', 'json']);
      if (!slot.ok) return { ok: false, reason: `az webapp deployment slot create failed: ${slot.message}` };
    }
    return { ok: true };
  }

  async deploy(projectPath: string, opts?: { prod?: boolean }): Promise<ConnectorResult<{ deploymentUrl: string; deploymentId: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    const ensured = await this.ensureAppExists();
    if (!ensured.ok) return ensured;

    const tmpZip = path.join(os.tmpdir(), `pawos-appservice-${Date.now()}.zip`);
    try {
      await compressPaths([projectPath], tmpZip);
    } catch (error) {
      return { ok: false, reason: `Failed to package project for zip-deploy: ${error instanceof Error ? error.message : String(error)}` };
    }

    const useSlot = this.stagingSlot && !opts?.prod;
    const args = ['webapp', 'deployment', 'source', 'config-zip', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--src', tmpZip];
    if (useSlot) args.push('--slot', this.stagingSlot as string);

    const deployResult = await runCli('az', args, 10 * 60 * 1000);
    fs.unlink(tmpZip, () => {});
    if (!deployResult.ok) return { ok: false, reason: `az webapp deployment source config-zip failed: ${deployResult.message}` };

    const latest = await this.getLatestDeployment();
    return { ok: true, deploymentUrl: latest.ok ? latest.url : `https://${this.appName}.azurewebsites.net`, deploymentId: latest.ok ? latest.deploymentId : 'unknown' };
  }

  async getLatestDeployment(): Promise<ConnectorResult<InfraDeployment>> {
    if (!this.isConfigured()) return this.notConfigured();
    const args = ['webapp', 'deployment', 'list', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--output', 'json'];
    const result = await runCli('az', args);
    if (!result.ok) return { ok: false, reason: `az webapp deployment list failed: ${result.message}` };
    const show = await runCli('az', ['webapp', 'show', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--query', 'defaultHostName', '--output', 'tsv']);
    const url = show.ok ? `https://${show.stdout}` : `https://${this.appName}.azurewebsites.net`;
    try {
      const deployments = JSON.parse(result.stdout) as Array<{ id: string; status?: number; end_time?: string }>;
      const latest = deployments[0];
      if (!latest) return { ok: true, deploymentId: 'unknown', url, status: 'no deployments yet', createdAt: new Date().toISOString() };
      return { ok: true, deploymentId: latest.id, url, status: latest.status === 4 ? 'success' : String(latest.status ?? 'unknown'), createdAt: latest.end_time ?? new Date().toISOString() };
    } catch {
      return { ok: false, reason: 'Could not parse az webapp deployment list output.' };
    }
  }

  /** Only has a real mechanism when a staging slot is configured — Azure's slot swap is genuinely
   * reversible, so running it again reverts a previous promote. Without a slot, there is nothing to
   * swap back to, so this honestly reports that instead of fabricating a rollback. */
  async rollback(): Promise<ConnectorResult<{ rolledBack?: true }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.stagingSlot) return { ok: false, reason: 'No staging slot configured (AZURE_APP_SERVICE_STAGING_SLOT) — without one, App Service has no separate version to roll back to.' };
    const swap = await runCli('az', ['webapp', 'deployment', 'slot', 'swap', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--slot', this.stagingSlot, '--target-slot', 'production']);
    if (!swap.ok) return { ok: false, reason: `az webapp deployment slot swap failed: ${swap.message}` };
    return { ok: true };
  }

  async promote(): Promise<ConnectorResult<{ deploymentUrl: string }>> {
    if (!this.isConfigured()) return this.notConfigured();
    if (!this.stagingSlot) return { ok: false, reason: 'No staging slot configured (AZURE_APP_SERVICE_STAGING_SLOT) — deploy() already targets production directly.' };
    const swap = await runCli('az', ['webapp', 'deployment', 'slot', 'swap', '--name', this.appName as string, '--resource-group', this.resourceGroup as string, '--slot', this.stagingSlot, '--target-slot', 'production']);
    if (!swap.ok) return { ok: false, reason: `az webapp deployment slot swap failed: ${swap.message}` };
    return { ok: true, deploymentUrl: `https://${this.appName}.azurewebsites.net` };
  }
}
