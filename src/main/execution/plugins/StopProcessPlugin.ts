import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';

/** Only ever acts on a processId ProcessManager itself spawned — never an arbitrary OS PID. */
export class StopProcessPlugin extends BasePlugin {
  id = 'stopProcess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'stopProcess';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'stopProcess') return [];
    if (!processManager.getInfo(request.processId)) {
      return [{ id: 'process-not-found', message: `I don't have a tracked process with id "${request.processId}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'stopProcess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await processManager.stop(request.processId);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { processId: request.processId, processes: processManager.list() } };
  }

  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'stopProcess' || !result.ok) return result;
    const info = processManager.getInfo(request.processId);
    if (info && info.status === 'running') {
      return { ok: false, reason: 'failed', message: 'Asked the process to stop, but it still shows as running.' };
    }
    return result;
  }

  describeInProgress(): string {
    return 'Stopping that process…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'stopProcess') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? 'Stopped it.' : describeFailure(result);
  }
}

export const stopProcessPlugin = new StopProcessPlugin();
