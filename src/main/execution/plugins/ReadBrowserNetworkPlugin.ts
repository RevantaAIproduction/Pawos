import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { DevBrowserNetworkEntry } from '../../../shared/actions/DevBrowserTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

export class ReadBrowserNetworkPlugin extends BasePlugin {
  id = 'readBrowserNetworkErrors';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'readBrowserNetworkErrors';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'readBrowserNetworkErrors') return [];
    if (!browserRuntime.isOpen(request.sessionId)) {
      return [{ id: 'session-not-open', message: "That Development Browser session isn't open." }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'readBrowserNetworkErrors') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entries = browserRuntime.getNetworkErrors(request.sessionId);
    if (entries === null) return { ok: false, reason: 'failed', message: "That Development Browser session isn't open." };
    return { ok: true, data: { entries } };
  }

  describeInProgress(): string {
    return 'Checking network activity…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'readBrowserNetworkErrors') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { entries: DevBrowserNetworkEntry[] } | undefined;
    const count = data?.entries.length ?? 0;
    return count === 0 ? 'No failed network requests.' : `Found ${count} failed request${count === 1 ? '' : 's'}.`;
  }
}

export const readBrowserNetworkPlugin = new ReadBrowserNetworkPlugin();
