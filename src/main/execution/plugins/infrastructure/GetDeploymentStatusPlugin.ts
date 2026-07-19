import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';

/**
 * Read-only "is it deployed, is CI green" check — tries a configured CI/CD
 * connector first (build/pipeline status), falls back to the last recorded
 * deployment in EngineeringMemoryStore. Never gated (read-only).
 */
export class GetDeploymentStatusPlugin extends BasePlugin {
  id = 'getDeploymentStatus';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getDeploymentStatus';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getDeploymentStatus') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    if (request.repo) {
      const cicd = infrastructureConnectorRegistry.firstConfigured('cicd');
      if (cicd) {
        const result = await cicd.getLatestRunStatus(request.repo, request.branch);
        if (result.ok) return { ok: true, data: { source: cicd.displayName, ...result } };
      }
    }

    const lastDeployment = engineeringMemoryStore.latestForService('deployment', request.serviceName);
    if (!lastDeployment) {
      return { ok: false, reason: 'failed', message: `I have no recorded deployment or CI status for "${request.serviceName}".` };
    }
    return {
      ok: true,
      data: { source: 'EngineeringMemoryStore', status: lastDeployment.status, at: lastDeployment.at, url: lastDeployment.refs?.url },
    };
  }

  describeInProgress(): string {
    return 'Checking deployment status…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getDeploymentStatus') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { source: string; status: string; url?: string };
    return `${request.serviceName}: ${data.status} (via ${data.source})${data.url ? ` — ${data.url}` : ''}.`;
  }
}

export const getDeploymentStatusPlugin = new GetDeploymentStatusPlugin();
