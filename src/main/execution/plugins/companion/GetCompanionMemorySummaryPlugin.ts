import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { getCompanionMemorySummary } from '../../../memory/entities/companionEntities';

/** Read-only "what do you remember about me" — real goals/routines/linked-entity count, never fabricated. Never gated. */
export class GetCompanionMemorySummaryPlugin extends BasePlugin {
  id = 'getCompanionMemorySummary';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getCompanionMemorySummary';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getCompanionMemorySummary') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const summary = getCompanionMemorySummary(request.companionId);
    return { ok: true, data: summary };
  }

  describeInProgress(): string {
    return 'Recalling what I remember…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { goals: unknown[]; routines: unknown[] };
    return `${data.goals.length} goal(s), ${data.routines.length} routine(s) remembered.`;
  }
}

export const getCompanionMemorySummaryPlugin = new GetCompanionMemorySummaryPlugin();
