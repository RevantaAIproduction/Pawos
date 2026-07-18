import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

export class CloseBrowserTabPlugin extends BasePlugin {
  id = 'closeBrowserTab';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'closeBrowserTab';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'closeBrowserTab') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'closeBrowserTab') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const closed = browserRuntime.close(request.sessionId);
    if (!closed) return { ok: false, reason: 'failed', message: 'That session was already closed.' };
    return { ok: true, data: { sessionId: request.sessionId } };
  }

  /**
   * Confirm it's actually gone, not just that .close() was called —
   * window.close() is asynchronous (Electron fires 'closed' on a later
   * tick), so this polls briefly rather than checking once immediately,
   * which would otherwise report a false failure almost every time.
   */
  async verify(request: ActionRequest, result: ActionResult): Promise<ActionResult> {
    if (request.type !== 'closeBrowserTab' || !result.ok) return result;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!browserRuntime.isOpen(request.sessionId)) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { ok: false, reason: 'failed', message: 'The tab still shows as open.' };
  }

  describeInProgress(): string {
    return 'Closing that tab…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'closeBrowserTab') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've closed it." : describeFailure(result);
  }
}

export const closeBrowserTabPlugin = new CloseBrowserTabPlugin();
