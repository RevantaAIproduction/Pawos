import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { browserRuntime } from '../browser/BrowserRuntime';
import { recordPageSummary } from '../../memory/entities/webEntities';

/** "Remember what you found" — persists Paw's own synthesis of a page after it actually read/extracted the content, not a guess from the URL alone. See webEntities.ts for why this exists. */
export class RecordPageSummaryPlugin extends BasePlugin {
  id = 'recordPageSummary';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordPageSummary';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordPageSummary') return [];
    if (!request.url && !request.sessionId) {
      return [{ id: 'no-target', message: 'Which page does this summary belong to?' }];
    }
    if (!request.summary || !request.summary.trim()) {
      return [{ id: 'no-summary', message: 'What should I remember about this page?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordPageSummary') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const url = request.url ?? (request.sessionId ? browserRuntime.getCurrentUrl(request.sessionId) : null);
    if (!url) return { ok: false, reason: 'failed', message: "I couldn't tell which page this summary belongs to — that session isn't open." };
    const entity = recordPageSummary(url, request.summary);
    return { ok: true, data: { url, entityId: entity.id } };
  }

  describeInProgress(): string {
    return 'Remembering this…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordPageSummary') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { url?: string } | undefined;
    return `Noted — I'll remember that about ${data?.url ?? 'that page'}.`;
  }
}

export const recordPageSummaryPlugin = new RecordPageSummaryPlugin();
