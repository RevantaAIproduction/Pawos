import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

/** Lets the model recall projects Paw has opened before, without re-scanning the disk. */
export class ListWorkspacesPlugin extends BasePlugin {
  id = 'listWorkspaces';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listWorkspaces';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listWorkspaces') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    return { ok: true, data: { workspaces: workspaceMemoryStore.list() } };
  }

  describeInProgress(): string {
    return 'Checking known projects…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listWorkspaces') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { workspaces: { name: string }[] } | undefined;
    const count = data?.workspaces.length ?? 0;
    return count === 0 ? "I haven't opened any projects yet." : `I know about ${count} project${count === 1 ? '' : 's'}.`;
  }
}

export const listWorkspacesPlugin = new ListWorkspacesPlugin();
