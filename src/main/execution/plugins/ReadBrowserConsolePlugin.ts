import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { DevBrowserConsoleEntry } from '../../../shared/actions/DevBrowserTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

export class ReadBrowserConsolePlugin extends BasePlugin {
  id = 'readBrowserConsole';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readBrowserConsole';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'readBrowserConsole') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'readBrowserConsole') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entries = browserRuntime.getConsoleLog(request.sessionId, request.maxEntries);
    if (entries === null) return { ok: false, reason: 'failed', message: "That Development Browser session isn't open." };
    return { ok: true, data: { entries } };
  }

  describeInProgress(): string {
    return 'Checking the browser console…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'readBrowserConsole') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { entries: DevBrowserConsoleEntry[] } | undefined;
    const errorCount = data?.entries.filter((e) => e.level === 'error').length ?? 0;
    return errorCount > 0 ? `Found ${errorCount} console error${errorCount === 1 ? '' : 's'}.` : 'No console errors.';
  }
}

export const readBrowserConsolePlugin = new ReadBrowserConsolePlugin();
