import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

export class GetWorkspacePlugin extends BasePlugin {
  id = 'getWorkspace';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getWorkspace';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getWorkspace') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const workspace = workspaceMemoryStore.get(request.rootPath);
    if (!workspace) return { ok: false, reason: 'failed', message: `I don't have anything remembered for "${request.rootPath}".` };
    return { ok: true, data: workspace };
  }

  describeInProgress(): string {
    return 'Checking what I remember about that project…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'getWorkspace') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const workspace = result.data as { name: string } | undefined;
    return workspace ? `Here's what I remember about "${workspace.name}".` : 'Done.';
  }
}

export const getWorkspacePlugin = new GetWorkspacePlugin();
