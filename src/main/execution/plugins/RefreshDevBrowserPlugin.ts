import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { devBrowserManager } from '../DevBrowserManager';

export class RefreshDevBrowserPlugin extends BasePlugin {
  id = 'refreshDevBrowser';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'refreshDevBrowser';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'refreshDevBrowser') return [];
    if (!devBrowserManager.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'refreshDevBrowser') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const result = await devBrowserManager.refresh(request.sessionId);
    return result.ok ? { ok: true } : { ok: false, reason: 'failed', message: result.message };
  }

  describeInProgress(): string {
    return 'Refreshing the page…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'refreshDevBrowser') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've refreshed the page." : describeFailure(result);
  }
}

export const refreshDevBrowserPlugin = new RefreshDevBrowserPlugin();
