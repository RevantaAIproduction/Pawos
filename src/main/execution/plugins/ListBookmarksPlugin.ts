import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { listBookmarkedPages, type WebPageAttributes } from '../../memory/entities/webEntities';

export class ListBookmarksPlugin extends BasePlugin {
  id = 'listBookmarks';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'listBookmarks';
  }

  async execute(): Promise<ActionResult> {
    const bookmarks = listBookmarkedPages().map((e) => e.attributes as WebPageAttributes);
    return { ok: true, data: { bookmarks } };
  }

  describeInProgress(): string {
    return 'Checking your bookmarks…';
  }

  describeDone(_request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { bookmarks?: unknown[] } | undefined;
    const count = data?.bookmarks?.length ?? 0;
    return count === 0 ? "You don't have any bookmarks saved with me yet." : `You have ${count} bookmark${count === 1 ? '' : 's'}.`;
  }
}

export const listBookmarksPlugin = new ListBookmarksPlugin();
