import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';

/** "Multi-tab browsing" is just multiple DevBrowserManager sessions — this lists what's already tracked rather than needing any new tab concept. */
export class ListBrowserTabsPlugin extends BasePlugin {
  id = 'listBrowserTabs';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listBrowserTabs';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'listBrowserTabs') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const sessionIds = browserRuntime.listSessions();
    const tabs = sessionIds.map((sessionId) => ({ sessionId, url: browserRuntime.getCurrentUrl(sessionId) }));
    return { ok: true, data: { tabs } };
  }

  describeInProgress(): string {
    return 'Checking open tabs…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'listBrowserTabs') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { tabs: unknown[] } | undefined;
    const count = data?.tabs.length ?? 0;
    return count === 0 ? 'No tabs are open.' : `${count} tab${count === 1 ? ' is' : 's are'} open.`;
  }
}

export const listBrowserTabsPlugin = new ListBrowserTabsPlugin();
