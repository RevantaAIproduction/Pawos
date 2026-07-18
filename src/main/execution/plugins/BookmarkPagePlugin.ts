import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { bookmarkPage } from '../../memory/entities/webEntities';

/** "Bookmark this page" — resolves the URL from an open session's current page, or an explicit url. Never touches the real browser's own Bookmarks file (see webEntities.ts). */
export class BookmarkPagePlugin extends BasePlugin {
  id = 'bookmarkPage';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'bookmarkPage';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'bookmarkPage') return [];
    if (!request.url && !request.sessionId) {
      return [{ id: 'no-target', message: 'Which page should I bookmark?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'bookmarkPage') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const url = request.url ?? (request.sessionId ? browserRuntime.getCurrentUrl(request.sessionId) : null);
    if (!url) return { ok: false, reason: 'failed', message: "I couldn't tell which page to bookmark — that session isn't open." };
    const entity = bookmarkPage(url, request.label);
    return { ok: true, data: { url, entityId: entity.id } };
  }

  describeInProgress(): string {
    return 'Bookmarking this page…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'bookmarkPage') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { url?: string } | undefined;
    return `I've bookmarked ${data?.url ?? 'that page'}.`;
  }
}

export const bookmarkPagePlugin = new BookmarkPagePlugin();
