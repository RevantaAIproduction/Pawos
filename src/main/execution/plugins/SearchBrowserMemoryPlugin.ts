import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { searchBrowserMemory } from '../../memory/entities/webEntities';

/** "Have I already looked into this?" — checked BEFORE starting new research, so Paw doesn't redundantly re-browse a page it already read and understood. */
export class SearchBrowserMemoryPlugin extends BasePlugin {
  id = 'searchBrowserMemory';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'searchBrowserMemory';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'searchBrowserMemory') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const matches = searchBrowserMemory(request.query);
    return { ok: true, data: { matches } };
  }

  describeInProgress(): string {
    return 'Checking what I already know…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { matches?: unknown[] } | undefined;
    const count = data?.matches?.length ?? 0;
    return count === 0 ? "I don't have anything remembered about that yet." : `Found ${count} thing${count === 1 ? '' : 's'} I already remember about that.`;
  }
}

export const searchBrowserMemoryPlugin = new SearchBrowserMemoryPlugin();
