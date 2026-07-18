import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { getComparison } from '../../memory/entities/comparisonEntities';

/** "Did I already compare these?" — checked before re-running a comparison Paw already did. */
export class GetComparisonPlugin extends BasePlugin {
  id = 'getComparison';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getComparison';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getComparison') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = getComparison(request.topic);
    return { ok: true, data: { found: Boolean(entity), comparison: entity?.attributes } };
  }

  describeInProgress(): string {
    return 'Checking for a saved comparison…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { found?: boolean } | undefined;
    return data?.found ? "I found a comparison I already saved for this." : "I haven't compared these before.";
  }
}

export const getComparisonPlugin = new GetComparisonPlugin();
