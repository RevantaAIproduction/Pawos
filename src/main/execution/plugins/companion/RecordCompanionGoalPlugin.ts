import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { recordCompanionGoal } from '../../../memory/entities/companionEntities';

export class RecordCompanionGoalPlugin extends BasePlugin {
  id = 'recordCompanionGoal';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordCompanionGoal';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordCompanionGoal') return [];
    if (!request.text.trim()) return [{ id: 'no-goal-text', message: 'What goal should I remember?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordCompanionGoal') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const goal = recordCompanionGoal(request.companionId, request.text);
    return { ok: true, data: { id: goal.id, text: request.text } };
  }

  describeInProgress(): string {
    return 'Remembering that goal…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordCompanionGoal') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `Remembered your goal: "${request.text}".`;
  }
}

export const recordCompanionGoalPlugin = new RecordCompanionGoalPlugin();
