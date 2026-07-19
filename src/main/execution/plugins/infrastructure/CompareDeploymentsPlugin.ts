import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';

export type DeploymentComparison = {
  serviceName: string;
  current: { summary: string; status: string; at: number; refs?: Record<string, string> } | null;
  previous: { summary: string; status: string; at: number; refs?: Record<string, string> } | null;
  differences: string[];
};

/** Deployment Intelligence's "deployment comparison" — diffs the two most recent real deployment records for a service. Never gated, never fabricates a diff when there's nothing to compare. */
export class CompareDeploymentsPlugin extends BasePlugin {
  id = 'compareDeployments';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'compareDeployments';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'compareDeployments') return [];
    const deployments = engineeringMemoryStore.deploymentsForService(request.serviceName);
    if (deployments.length < 2) {
      return [{ id: 'not-enough-deployments', message: `I only have ${deployments.length} deployment(s) on record for "${request.serviceName}" — need at least 2 to compare.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'compareDeployments') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const deployments = engineeringMemoryStore.deploymentsForService(request.serviceName);
    const [current, previous] = deployments;
    if (!current || !previous) {
      return { ok: false, reason: 'failed', message: `Not enough recorded deployments for "${request.serviceName}" to compare.` };
    }

    const differences: string[] = [];
    if (current.status !== previous.status) differences.push(`Status changed: ${previous.status} → ${current.status}.`);
    if (current.refs?.provider !== previous.refs?.provider) differences.push(`Hosting connector changed: ${previous.refs?.provider ?? 'unknown'} → ${current.refs?.provider ?? 'unknown'}.`);
    if (current.refs?.environment !== previous.refs?.environment) differences.push(`Environment changed: ${previous.refs?.environment ?? 'unknown'} → ${current.refs?.environment ?? 'unknown'}.`);
    const gapMs = current.at - previous.at;
    differences.push(`${Math.round(gapMs / 60000)} minute(s) between these two deployments.`);

    const comparison: DeploymentComparison = {
      serviceName: request.serviceName,
      current: { summary: current.summary, status: current.status, at: current.at, refs: current.refs },
      previous: { summary: previous.summary, status: previous.status, at: previous.at, refs: previous.refs },
      differences,
    };
    return { ok: true, data: comparison };
  }

  describeInProgress(): string {
    return 'Comparing deployments…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as DeploymentComparison;
    return `Compared the last 2 deployments of "${data.serviceName}" — ${data.differences.length} difference(s) found.`;
  }
}

export const compareDeploymentsPlugin = new CompareDeploymentsPlugin();
