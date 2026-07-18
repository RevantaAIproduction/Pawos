import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { devBrowserManager } from '../DevBrowserManager';
import { workspaceMemoryStore } from '../WorkspaceMemoryStore';

export class OpenDevBrowserPlugin extends BasePlugin {
  id = 'openDevBrowser';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'openDevBrowser';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'openDevBrowser') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await devBrowserManager.open(request.sessionId, request.url, workspaceMemoryStore.listDeploymentUrls());
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'openDevBrowser') return 'Working on that…';
    return `Opening ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'openDevBrowser') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    return `I've opened ${request.url} in the Development Browser.`;
  }
}

export const openDevBrowserPlugin = new OpenDevBrowserPlugin();
