import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';
import { upsertRepository } from '../../../memory/entities/infrastructureEntities';

/**
 * Infrastructure Discovery Engine — "build a complete infrastructure graph
 * automatically whenever permissions allow." Today that means: for every
 * configured source control connector, list its real repositories and
 * register each as a `repository` entity. Deliberately does not attempt to
 * discover services/deployments/domains automatically — those only become
 * real once a real deploy/investigation happens (Paw never fabricates a
 * service existing before it's actually seen one). Never gated, read-only.
 */
export class DiscoverInfrastructurePlugin extends BasePlugin {
  id = 'discoverInfrastructure';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'discoverInfrastructure';
  }

  async execute(): Promise<ActionResult> {
    const connectors = infrastructureConnectorRegistry.listConfigured('sourceControl');
    if (connectors.length === 0) {
      return { ok: true, data: { discovered: 0, connectorsChecked: 0, repositories: [] as string[] } };
    }

    const repositories: string[] = [];
    for (const connector of connectors) {
      const result = await connector.listRepositories();
      if (!result.ok) continue;
      for (const repo of result.repos) {
        upsertRepository({ fullName: repo.fullName, provider: connector.id, url: repo.url, defaultBranch: repo.defaultBranch });
        repositories.push(repo.fullName);
      }
    }

    return { ok: true, data: { discovered: repositories.length, connectorsChecked: connectors.length, repositories } };
  }

  describeInProgress(): string {
    return 'Discovering infrastructure…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { discovered: number; connectorsChecked: number };
    return data.connectorsChecked === 0
      ? 'No source control connector is configured yet, so there was nothing to discover.'
      : `Discovered ${data.discovered} repositor${data.discovered === 1 ? 'y' : 'ies'} across ${data.connectorsChecked} connector(s).`;
  }
}

export const discoverInfrastructurePlugin = new DiscoverInfrastructurePlugin();
