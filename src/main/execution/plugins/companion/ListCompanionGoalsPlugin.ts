import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { listCompanionGoals } from '../../../memory/entities/companionEntities';
import type { CompanionGoalAttributes } from '../../../memory/entities/companionEntities';

export class ListCompanionGoalsPlugin extends BasePlugin {
  id = 'listCompanionGoals';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listCompanionGoals';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listCompanionGoals') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const goals = listCompanionGoals(request.companionId).map((g) => {
      const a = g.attributes as CompanionGoalAttributes;
      return { id: g.id, text: a.text, completed: Boolean(a.completedAt) };
    });
    return { ok: true, data: { goals } };
  }

  describeInProgress(): string {
    return 'Checking goals…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { goals: unknown[] };
    return data.goals.length > 0 ? `${data.goals.length} goal(s) found.` : 'No goals recorded yet.';
  }
}

export const listCompanionGoalsPlugin = new ListCompanionGoalsPlugin();
