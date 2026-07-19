import { randomUUID } from 'crypto';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';

/**
 * "Rollback yesterday's deployment" — reverts to the deployment recorded
 * immediately before the most recent one (never the same one, that would be
 * a no-op), through whichever hosting connector performed the original
 * deploy. Always confirmed — production-impacting.
 */
export class RollbackDeploymentPlugin extends BasePlugin {
  id = 'rollbackDeployment';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'rollbackDeployment';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'rollbackDeployment') return [];
    const deployments = engineeringMemoryStore.deploymentsForService(request.serviceName);
    if (deployments.length < 2) {
      return [{ id: 'no-previous-deployment', message: `I don't have a previous deployment recorded for "${request.serviceName}" to roll back to.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'rollbackDeployment') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.confirmed) return { ok: false, reason: 'requires-confirmation' };

    const deployments = engineeringMemoryStore.deploymentsForService(request.serviceName);
    const target = deployments[1];
    if (!target) return { ok: false, reason: 'failed', message: `No previous deployment recorded for "${request.serviceName}".` };

    const providerId = target.refs?.provider;
    const deploymentId = target.refs?.deploymentId;
    if (!providerId || !deploymentId) {
      return { ok: false, reason: 'failed', message: `The recorded deployment for "${request.serviceName}" is missing the data needed to roll back to it.` };
    }

    const connector = infrastructureConnectorRegistry.get('hosting', providerId);
    if (!connector) {
      return { ok: false, reason: 'failed', message: `The "${providerId}" hosting connector that performed this deployment isn't configured anymore.` };
    }

    const result = await connector.rollback(deploymentId);
    if (!result.ok) {
      engineeringMemoryStore.record({
        id: randomUUID(),
        kind: 'rollback',
        serviceName: request.serviceName,
        summary: `Rollback of ${request.serviceName} via ${connector.displayName} failed`,
        detail: result.reason,
        status: 'failure',
        at: Date.now(),
        refs: { deploymentId, provider: connector.id },
        approvedByUser: true,
      });
      return { ok: false, reason: 'failed', message: result.reason };
    }

    engineeringMemoryStore.record({
      id: randomUUID(),
      kind: 'rollback',
      serviceName: request.serviceName,
      summary: `Rolled back ${request.serviceName} to a previous deployment via ${connector.displayName}`,
      status: 'success',
      at: Date.now(),
      refs: { deploymentId, provider: connector.id },
      approvedByUser: true,
    });

    return { ok: true, data: { serviceName: request.serviceName, deploymentId, provider: connector.id } };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'rollbackDeployment') return 'Working on that…';
    return `Rolling back ${request.serviceName}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'rollbackDeployment') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return `This will roll ${request.serviceName} back to its previous deployment. Should I go ahead?`;
      return describeFailure(result);
    }
    return `Rolled ${request.serviceName} back to its previous deployment.`;
  }
}

export const rollbackDeploymentPlugin = new RollbackDeploymentPlugin();
