import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';
import { recordDeployment } from '../../../memory/entities/infrastructureEntities';

/**
 * "Promote staging to production" — finds the most recent non-production
 * deployment recorded for a service and promotes it to production through
 * the hosting connector that built it, without a new build when the
 * provider supports it (Vercel's real `promote` subcommand; Netlify's
 * publish-existing-deploy endpoint). Always confirmed — production-impacting.
 */
export class PromoteDeploymentPlugin extends BasePlugin {
  id = 'promoteDeployment';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'promoteDeployment';
  }

  private findPromotable(serviceName: string) {
    return engineeringMemoryStore.deploymentsForService(serviceName).find((e) => e.refs?.environment && e.refs.environment !== 'production');
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'promoteDeployment') return [];
    if (!this.findPromotable(request.serviceName)) {
      return [{ id: 'no-staging-deployment', message: `I don't have a non-production deployment recorded for "${request.serviceName}" to promote.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'promoteDeployment') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.confirmed) return { ok: false, reason: 'requires-confirmation' };

    const source = this.findPromotable(request.serviceName);
    if (!source) return { ok: false, reason: 'failed', message: `No non-production deployment recorded for "${request.serviceName}".` };

    const providerId = source.refs?.provider;
    const deploymentId = source.refs?.deploymentId;
    if (!providerId || !deploymentId) {
      return { ok: false, reason: 'failed', message: `The recorded deployment for "${request.serviceName}" is missing the data needed to promote it.` };
    }

    const connector = infrastructureConnectorRegistry.get('hosting', providerId);
    if (!connector) {
      return { ok: false, reason: 'failed', message: `The "${providerId}" hosting connector that built this deployment isn't configured anymore.` };
    }

    const result = await connector.promote(deploymentId);
    if (!result.ok) {
      engineeringMemoryStore.record({
        id: randomUUID(),
        kind: 'deployment',
        serviceName: request.serviceName,
        summary: `Promotion of ${request.serviceName} to production via ${connector.displayName} failed`,
        detail: result.reason,
        status: 'failure',
        at: Date.now(),
        refs: { deploymentId, provider: connector.id },
        approvedByUser: true,
      });
      return { ok: false, reason: 'failed', message: result.reason };
    }

    recordDeployment({
      deploymentId,
      provider: connector.id,
      serviceName: request.serviceName,
      url: result.deploymentUrl,
      status: 'success',
      environment: 'production',
      deployedAt: Date.now(),
    });
    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'deployment',
      serviceName: request.serviceName,
      summary: `Promoted ${request.serviceName} to production via ${connector.displayName}`,
      status: 'success',
      at: Date.now(),
      refs: { deploymentId, provider: connector.id, url: result.deploymentUrl, environment: 'production' },
      approvedByUser: true,
    });

    return { ok: true, data: { serviceName: request.serviceName, deploymentId, provider: connector.id, deploymentUrl: result.deploymentUrl } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'promoteDeployment') return 'Working on that…';
    return `Promoting ${request.serviceName} to production…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'promoteDeployment') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will promote ${request.serviceName}'s current staging/preview deployment to production. Should I go ahead?`;
      return describeFailure(result);
    }
    const data = result.data as { deploymentUrl: string } | undefined;
    return `Promoted ${request.serviceName} to production — it's live at ${data?.deploymentUrl}.`;
  }
}

export const promoteDeploymentPlugin = new PromoteDeploymentPlugin();
