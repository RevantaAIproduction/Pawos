import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infrastructureConnectorRegistry } from '../../../infrastructure/InfrastructureConnectorRegistry';

/**
 * Read-only PR/MR listing for a repo — "what pull requests are open on
 * this repo" — never gated, same investigation-always-available precedent
 * as getDeploymentStatus/investigateTicket.
 */
export class ListPullRequestsPlugin extends BasePlugin {
  id = 'listPullRequests';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listPullRequests';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listPullRequests') return { ok: false, reason: 'failed', message: 'Mismatched request.' };

    const connector = request.provider
      ? infrastructureConnectorRegistry.get('sourceControl', request.provider)
      : infrastructureConnectorRegistry.firstConfigured('sourceControl');
    if (!connector) {
      return { ok: false, reason: 'failed', message: 'No source control connector is configured. Add GITHUB_TOKEN or GITLAB_TOKEN to .env to connect one.' };
    }

    const result = await connector.listPullRequests(request.repo);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.reason };

    return { ok: true, data: { provider: connector.id, repo: request.repo, pullRequests: result.pullRequests } };
  }

  describeInProgress(): string {
    return 'Checking pull requests…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listPullRequests') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { pullRequests: { number: number; title: string; state: string }[] };
    if (data.pullRequests.length === 0) return `${request.repo} has no pull requests right now.`;
    return `${request.repo} has ${data.pullRequests.length} pull request${data.pullRequests.length === 1 ? '' : 's'}: ${data.pullRequests
      .slice(0, 5)
      .map((pr) => `#${pr.number} "${pr.title}" (${pr.state})`)
      .join(', ')}${data.pullRequests.length > 5 ? ', …' : ''}.`;
  }
}

export const listPullRequestsPlugin = new ListPullRequestsPlugin();
