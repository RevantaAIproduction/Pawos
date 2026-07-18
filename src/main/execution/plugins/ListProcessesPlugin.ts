import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { processManager } from '../ProcessManager';

export class ListProcessesPlugin extends BasePlugin {
  id = 'listProcesses';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listProcesses';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listProcesses') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    return { ok: true, data: { processes: processManager.list() } };
  }

  describeInProgress(): string {
    return 'Checking running processes…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listProcesses') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { processes: { command: string; status: string }[] } | undefined;
    const count = data?.processes.length ?? 0;
    if (count === 0) return "I'm not tracking any processes right now.";
    return `I'm tracking ${count} process${count === 1 ? '' : 'es'} right now.`;
  }
}

export const listProcessesPlugin = new ListProcessesPlugin();
