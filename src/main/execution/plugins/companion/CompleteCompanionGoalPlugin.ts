import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { completeCompanionGoal } from '../../../memory/entities/companionEntities';

export class CompleteCompanionGoalPlugin extends BasePlugin {
  id = 'completeCompanionGoal';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'completeCompanionGoal';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'completeCompanionGoal') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const goal = completeCompanionGoal(request.goalId);
    if (!goal) return { ok: false, reason: 'failed', message: "I can't find that goal." };
    return { ok: true, data: { id: goal.id } };
  }

  describeInProgress(): string {
    return 'Marking goal complete…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return 'Marked that goal complete.';
  }
}

export const completeCompanionGoalPlugin = new CompleteCompanionGoalPlugin();
