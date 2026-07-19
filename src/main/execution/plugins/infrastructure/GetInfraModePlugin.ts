import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infraModeStore } from '../../../infrastructure/InfraModeStore';

export class GetInfraModePlugin extends BasePlugin {
  id = 'getInfraMode';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getInfraMode';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { preferences: infraModeStore.get() } };
  }

  describeInProgress(): string {
    return 'Checking infrastructure mode…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    return infraModeStore.getMode() === 'full'
      ? "You're in Full mode — I can deploy and roll back when confirmed."
      : "You're in read-only investigation mode — tickets, status, and health checks only.";
  }
}

export const getInfraModePlugin = new GetInfraModePlugin();
