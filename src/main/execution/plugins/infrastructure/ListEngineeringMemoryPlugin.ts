import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { engineeringMemoryStore } from '../../../infrastructure/EngineeringMemoryStore';

/** Read-only "what has Paw actually deployed/rolled back/investigated" — backs the Workspace UI's deployment/rollback history and engineering memory regions. Never gated. */
export class ListEngineeringMemoryPlugin extends BasePlugin {
  id = 'listEngineeringMemory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listEngineeringMemory';
  }

  async execute(): Promise<ActionResult> {
    return { ok: true, data: { entries: engineeringMemoryStore.list().slice(0, 50) } };
  }

  describeInProgress(): string {
    return 'Checking engineering memory…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { entries: unknown[] };
    return `${data.entries.length} engineering record(s) on file.`;
  }
}

export const listEngineeringMemoryPlugin = new ListEngineeringMemoryPlugin();
