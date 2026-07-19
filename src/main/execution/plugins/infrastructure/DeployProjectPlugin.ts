import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { WorkflowMetadata } from '../../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { analyzeProject } from '../../ProjectAnalyzer';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { upsertService, recordDeployment, findDomain } from '../../../memory/entities/infrastructureEntities';
import { waitForHttpHealthy } from '../../verification/ProcessVerification';

type DeployData = {
  serviceName: string;
  provider: string;
  deploymentUrl: string;
  deploymentId: string;
  healthVerified?: boolean;
  autoRolledBackTo?: string;
};

/**
 * "Host my website" / "Deploy my CRM" / "Deploy this SaaS" without naming a
 * provider. Never invents deployment infrastructure — if the project already
 * has its own deploy command (package.json scripts.deploy), this defers to
 * RunDeployScriptPlugin instead of duplicating that path; otherwise it picks
 * whichever hosting connector is actually configured (Vercel/Netlify today)
 * and deploys through it. Always confirmed — production-impacting.
 */
export class DeployProjectPlugin extends BasePlugin {
  id = 'deployProject';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'deployProject';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'deployProject') return [];
    if (!fs.existsSync(request.cwd)) {
      return [{ id: 'cwd-missing', message: `I can't find the folder "${request.cwd}" — which project directory did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'deployProject') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.confirmed) return { ok: false, reason: 'requires-confirmation' };

    const context = await analyzeProject(request.cwd);

    if (context.scripts.deploy) {
      return {
        ok: false,
        reason: 'failed',
        message: `This project already has its own deploy command (\`${context.scripts.deploy}\`) — use that directly (runDeployScript) instead of a hosting connector.`,
      };
    }

    const connector = infrastructureConnectorRegistry.firstConfigured('hosting');
    if (!connector) {
      return {
        ok: false,
        reason: 'failed',
        message: 'No hosting connector is configured yet. Add VERCEL_TOKEN or NETLIFY_TOKEN to .env to let me deploy this project directly.',
      };
    }

    const serviceName = context.workspaceName;
    const environment = request.environment ?? 'production';
    const deployResult = await connector.deploy(request.cwd, { prod: environment !== 'preview' });

    const plan = [`Analyze project (${context.framework ?? 'unknown framework'})`, `Select hosting connector (${connector.displayName})`, 'Deploy', 'Record deployment'];

    if (!deployResult.ok) {
      engineeringMemoryStore.record({
        id: randomUUID(),
        kind: 'deployment',
        serviceName,
        repositoryFullName: context.git.remoteUrl,
        summary: `Deploy of ${serviceName} via ${connector.displayName} failed`,
        detail: deployResult.reason,
        status: 'failure',
        at: Date.now(),
        refs: { provider: connector.id },
        approvedByUser: true,
      });
      return { ok: false, reason: 'failed', message: deployResult.reason };
    }

    upsertService({ name: serviceName, repositoryFullName: context.git.remoteUrl, framework: context.framework ?? undefined });
    recordDeployment({
      deploymentId: deployResult.deploymentId,
      provider: connector.id,
      serviceName,
      url: deployResult.deploymentUrl,
      status: 'success',
      environment,
      deployedAt: Date.now(),
    });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'deployment',
      serviceName,
      repositoryFullName: context.git.remoteUrl,
      summary: `Deployed ${serviceName} to ${environment} via ${connector.displayName}`,
      status: 'success',
      at: Date.now(),
      refs: { deploymentId: deployResult.deploymentId, provider: connector.id, url: deployResult.deploymentUrl, environment },
      approvedByUser: true,
    });

    const workflowMeta: WorkflowMetadata = { workflowName: `Deploy: ${serviceName}`, plan, candidatesProcessed: 1, successfulSteps: 1, failedSteps: 0 };
    const data: DeployData & WorkflowMetadata = { serviceName, provider: connector.id, deploymentUrl: deployResult.deploymentUrl, deploymentId: deployResult.deploymentId, ...workflowMeta };
    return { ok: true, data };
  }

  /**
   * "Verify Health" step of the Autonomous Engineering Loop — a real HTTP
   * health check against the service's registered domain (falling back to
   * the fresh deployment URL if none is registered yet). Runs again after
   * any recover() attempt too (the engine's own retry loop), so a
   * successful automatic rollback gets re-verified against the now-restored
   * previous deployment, not just assumed healthy.
   */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'deployProject' || !result.ok) return result;
    const data = result.data as DeployData;
    const domain = findDomain(data.serviceName);
    const hostname = domain ? (domain.attributes as { hostname: string }).hostname : undefined;
    const url = hostname ? (hostname.startsWith('http') ? hostname : `https://${hostname}`) : data.deploymentUrl;
    const health = await waitForHttpHealthy(url, { timeoutMs: 15_000 });
    if (health.ok) return { ...result, data: { ...data, healthVerified: true } };
    return { ok: false, reason: 'failed', message: `Deployed but failed its post-deploy health check at ${url}: ${health.message}`, data };
  }

  /**
   * "Rollback Automatically if required" — this happens entirely inside the
   * single deploy_project action the user already confirmed once (same
   * "goal ownership" precedent as the automatic build/run/test/fix loop and
   * the bounded install/configure/verify workflow) — reverting a broken
   * change back to what was already live is the conservative, safe
   * direction, never a new production change requiring its own separate
   * approval. If there's no previous deployment on record, or the connector
   * that built it isn't configured anymore, this says so honestly instead
   * of pretending to roll back.
   */
  async recover(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'deployProject' || result.ok) return result;
    const data = result.data as DeployData | undefined;
    if (!data?.serviceName) return result;

    const deployments = engineeringMemoryStore.deploymentsForService(data.serviceName);
    const previous = deployments[1];
    const previousDeploymentId = previous?.refs?.deploymentId;
    const previousProviderId = previous?.refs?.provider;
    if (!previous || !previousDeploymentId || !previousProviderId) {
      return { ok: false, reason: 'failed', message: `Health check failed after deploying ${data.serviceName}, and there's no previous deployment on record to automatically roll back to — manual intervention needed.`, data };
    }

    const connector = infrastructureConnectorRegistry.get('hosting', previousProviderId);
    if (!connector) {
      return { ok: false, reason: 'failed', message: `Health check failed after deploying ${data.serviceName}, but the "${previousProviderId}" connector that built the previous deployment isn't configured anymore — can't automatically roll back.`, data };
    }

    const rollback = await connector.rollback(previousDeploymentId);
    if (!rollback.ok) {
      return { ok: false, reason: 'failed', message: `Health check failed after deploying ${data.serviceName}, and the automatic rollback also failed: ${rollback.reason}`, data };
    }

    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'rollback',
      serviceName: data.serviceName,
      summary: `Automatically rolled back ${data.serviceName} after a failed post-deploy health check`,
      status: 'success',
      at: Date.now(),
      refs: { deploymentId: previousDeploymentId, provider: connector.id },
      approvedByUser: true,
    });

    return { ok: true, data: { ...data, autoRolledBackTo: previousDeploymentId } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'deployProject') return 'Working on that…';
    return `Deploying ${request.cwd}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'deployProject') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will deploy the project at ${request.cwd} to ${request.environment ?? 'production'}. Should I go ahead?`;
      return describeFailure(result);
    }
    const data = result.data as DeployData | undefined;
    if (data?.autoRolledBackTo) {
      return `Deployed ${data.serviceName}, but its post-deploy health check failed, so I automatically rolled it back to the previous deployment — it's healthy again now.`;
    }
    return `Deployed ${data?.serviceName} via ${data?.provider} — it's live at ${data?.deploymentUrl}${data?.healthVerified ? ' and passed its health check' : ''}.`;
  }
}

export const deployProjectPlugin = new DeployProjectPlugin();
