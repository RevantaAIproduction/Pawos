import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { getVisitHistory } from '../../memory/entities/webEntities';

/** "Show what I read yesterday" — Paw's own recorded browsing history (Memory Graph), not a read of the real browser's History file. */
export class GetBrowserHistoryPlugin extends BasePlugin {
  id = 'getBrowserHistory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getBrowserHistory';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getBrowserHistory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const visits = getVisitHistory(request.since, request.until, request.limit);
    return { ok: true, data: { visits } };
  }

  describeInProgress(): string {
    return 'Checking what I remember browsing…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { visits?: unknown[] } | undefined;
    const count = data?.visits?.length ?? 0;
    return count === 0 ? "I don't have any browsing history for that." : `Found ${count} page${count === 1 ? '' : 's'} I visited.`;
  }
}

export const getBrowserHistoryPlugin = new GetBrowserHistoryPlugin();
