import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { getResearchStatus } from '../../memory/entities/researchEntities';

/** "Where did I leave off?" — call FIRST when resuming or continuing a research topic, before any new browsing. */
export class GetResearchStatusPlugin extends BasePlugin {
  id = 'getResearchStatus';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getResearchStatus';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getResearchStatus') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = getResearchStatus(request.topic);
    return { ok: true, data: { found: Boolean(entity), task: entity?.attributes } };
  }

  describeInProgress(): string {
    return 'Checking research progress…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { found?: boolean } | undefined;
    return data?.found ? "I found where I left off on this." : "I haven't started researching this yet.";
  }
}

export const getResearchStatusPlugin = new GetResearchStatusPlugin();
