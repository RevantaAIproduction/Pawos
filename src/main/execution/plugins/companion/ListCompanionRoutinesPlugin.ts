import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { listCompanionRoutines } from '../../../memory/entities/companionEntities';
import type { CompanionRoutineAttributes } from '../../../memory/entities/companionEntities';

export class ListCompanionRoutinesPlugin extends BasePlugin {
  id = 'listCompanionRoutines';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listCompanionRoutines';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listCompanionRoutines') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const routines = listCompanionRoutines(request.companionId).map((r) => {
      const a = r.attributes as CompanionRoutineAttributes;
      return { id: r.id, description: a.description, cadence: a.cadence };
    });
    return { ok: true, data: { routines } };
  }

  describeInProgress(): string {
    return 'Checking routines…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { routines: unknown[] };
    return data.routines.length > 0 ? `${data.routines.length} routine(s) found.` : 'No routines recorded yet.';
  }
}

export const listCompanionRoutinesPlugin = new ListCompanionRoutinesPlugin();
