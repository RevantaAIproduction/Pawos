import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { infraModeStore } from '../../../infrastructure/InfraModeStore';

/** Switches the local read-only-investigation vs full-execution preference — not a purchased plan, no billing, no auth check. */
export class SetInfraModePlugin extends BasePlugin {
  id = 'setInfraMode';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setInfraMode';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setInfraMode') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const preferences = infraModeStore.setMode(request.mode);
    return { ok: true, data: { preferences } };
  }

  describeInProgress(): string {
    return 'Switching infrastructure mode…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setInfraMode') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return request.mode === 'full'
      ? 'Switched to Full mode — I can now deploy and roll back real infrastructure when you confirm.'
      : "Switched to read-only investigation mode — I'll stick to tickets, status, and health checks from here.";
  }
}

export const setInfraModePlugin = new SetInfraModePlugin();
