import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ObservationEvent } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';
import { observeProcess } from '../verification/ProcessVerification';

export class RestartProcessPlugin extends BasePlugin {
  id = 'restartProcess';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'restartProcess';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'restartProcess') return [];
    if (!processManager.getInfo(request.processId)) {
      return [{ id: 'process-not-found', message: `I don't have a tracked process with id "${request.processId}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'restartProcess') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await processManager.restart(request.processId);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.message };
    return { ok: true, data: { ...result.info, processes: processManager.list() } };
  }

  async *observe(request: ActionRequest, executeResult: ActionResult): AsyncGenerator<ObservationEvent> {
    if (request.type !== 'restartProcess' || !executeResult.ok) return;
    const info = executeResult.data as { id?: string } | undefined;
    if (!info?.id) return;
    yield* observeProcess(info.id, { timeoutMs: 8_000 });
  }

  describeInProgress(): string {
    return 'Restarting that process…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'restartProcess') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const info = result.data as { id: string; pid: number | null } | undefined;
    return `Restarted it${info?.pid ? ` (new pid ${info.pid})` : ''}.`;
  }
}

export const restartProcessPlugin = new RestartProcessPlugin();
