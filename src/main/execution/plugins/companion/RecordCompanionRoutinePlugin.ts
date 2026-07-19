import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { recordCompanionRoutine } from '../../../memory/entities/companionEntities';

export class RecordCompanionRoutinePlugin extends BasePlugin {
  id = 'recordCompanionRoutine';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordCompanionRoutine';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordCompanionRoutine') return [];
    if (!request.description.trim()) return [{ id: 'no-routine-description', message: 'What routine should I remember?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordCompanionRoutine') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const routine = recordCompanionRoutine(request.companionId, request.description, request.cadence);
    return { ok: true, data: { id: routine.id, description: request.description, cadence: request.cadence } };
  }

  describeInProgress(): string {
    return 'Remembering that routine…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordCompanionRoutine') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `Remembered your routine: "${request.description}"${request.cadence ? ` (${request.cadence})` : ''}.`;
  }
}

export const recordCompanionRoutinePlugin = new RecordCompanionRoutinePlugin();
