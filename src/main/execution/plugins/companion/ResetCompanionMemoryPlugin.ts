import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { resetCompanionMemory } from '../../../memory/entities/companionEntities';

/** Irreversible — deletes every real goal/routine remembered for this companion. Always confirmed (see DESTRUCTIVE_ACTION_TYPES). */
export class ResetCompanionMemoryPlugin extends BasePlugin {
  id = 'resetCompanionMemory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'resetCompanionMemory';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'resetCompanionMemory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    resetCompanionMemory(request.companionId);
    return { ok: true, data: { companionId: request.companionId } };
  }

  describeInProgress(): string {
    return 'Resetting companion memory…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') return 'This will permanently erase everything I remember about this companion. Are you sure?';
      return describeFailure(result);
    }
    return "I've forgotten everything I remembered for this companion.";
  }
}

export const resetCompanionMemoryPlugin = new ResetCompanionMemoryPlugin();
