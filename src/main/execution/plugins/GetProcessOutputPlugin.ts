import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';

/**
 * The model's on-demand, bounded pull of a process's output — kept
 * separate from the unbounded live stream the renderer subscribes to
 * (process:output push channel), so the model's context never gets flooded
 * by a chatty dev server.
 */
export class GetProcessOutputPlugin extends BasePlugin {
  id = 'getProcessOutput';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getProcessOutput';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'getProcessOutput') return [];
    if (!processManager.getInfo(request.processId)) {
      return [{ id: 'process-not-found', message: `I don't have a tracked process with id "${request.processId}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getProcessOutput') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = processManager.getOutput(request.processId, request.maxChars);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { output: result.output, info: result.info } };
  }

  describeInProgress(): string {
    return 'Checking its output…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getProcessOutput') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? 'Here is the latest output.' : describeFailure(result);
  }
}

export const getProcessOutputPlugin = new GetProcessOutputPlugin();
