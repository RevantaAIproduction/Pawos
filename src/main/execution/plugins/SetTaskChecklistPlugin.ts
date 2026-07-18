import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';

/**
 * Declares/updates a coding task's checklist — a pure pass-through, same
 * "return real structured data, let the Task Card/Workspace Canvas
 * shape-detect it" precedent as the Comparison Workflow plugin. No storage
 * of its own: the current task's own actions array already holds the full
 * history, and only the latest call's item list is ever shown.
 */
export class SetTaskChecklistPlugin extends BasePlugin {
  id = 'setTaskChecklist';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'setTaskChecklist';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'setTaskChecklist') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    return { ok: true, data: { items: request.items } };
  }

  describeInProgress(): string {
    return 'Updating the task checklist…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'setTaskChecklist') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const done = request.items.filter((i) => i.status === 'done').length;
    return `Checklist updated — ${done}/${request.items.length} done.`;
  }
}

export const setTaskChecklistPlugin = new SetTaskChecklistPlugin();
