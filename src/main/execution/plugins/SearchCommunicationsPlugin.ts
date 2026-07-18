import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { communicationRuntime } from '../../communication/CommunicationRuntime';

/** Advanced Search (architecture doc §19) — keyword, timeline, participant, company, project, date, attachment, and transcript search, plus natural-language query parsing when `apiKey` is available. `apiKey` is always injected by ConversationRuntime, never model-supplied. */
export class SearchCommunicationsPlugin extends BasePlugin {
  id = 'searchCommunications';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'searchCommunications';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'searchCommunications') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    try {
      const results = await communicationRuntime.search(request.query, request.apiKey);
      return { ok: true, data: { results } };
    } catch (error) {
      return { ok: false, reason: 'failed', message: (error as Error).message };
    }
  }

  describeInProgress(): string {
    return 'Searching your communications…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'searchCommunications') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const count = (result.data as { results?: unknown[] } | undefined)?.results?.length ?? 0;
    return count > 0 ? `Found ${count} match${count === 1 ? '' : 'es'}.` : "I didn't find anything matching that.";
  }
}

export const searchCommunicationsPlugin = new SearchCommunicationsPlugin();
