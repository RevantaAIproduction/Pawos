import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ErrorMemoryEntry } from '../../../shared/actions/ErrorMemoryTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { errorMemoryStore } from '../ErrorMemoryStore';

/** Called before attempting a fresh fix — reuse a previously-successful fix before trying something new. */
export class FindSimilarErrorsPlugin extends BasePlugin {
  id = 'findSimilarErrors';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'findSimilarErrors';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'findSimilarErrors') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const matches = errorMemoryStore.findSimilar(request.problem, request.workspaceRoot);
    return { ok: true, data: { matches } };
  }

  describeInProgress(): string {
    return 'Checking whether I\'ve seen this before…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'findSimilarErrors') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { matches: ErrorMemoryEntry[] } | undefined;
    const count = data?.matches.length ?? 0;
    return count === 0 ? "I haven't seen this exact problem before." : `I've fixed something like this before — ${count} similar case${count === 1 ? '' : 's'}.`;
  }
}

export const findSimilarErrorsPlugin = new FindSimilarErrorsPlugin();
