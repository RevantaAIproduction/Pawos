import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { recordComparison } from '../../memory/entities/comparisonEntities';

/** The Comparison Engine's save step — real extracted values, a ranking, and a recommendation, never invented. See comparisonEntities.ts. */
export class RecordComparisonPlugin extends BasePlugin {
  id = 'recordComparison';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordComparison';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordComparison') return [];
    if (!request.candidates || request.candidates.length === 0) {
      return [{ id: 'no-candidates', message: 'What am I comparing? I need at least one real candidate with extracted values.' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordComparison') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = recordComparison(request.topic, request.candidates, request.ranking, request.recommendation);
    return { ok: true, data: { topic: request.topic, entityId: entity.id, candidateCount: request.candidates.length } };
  }

  describeInProgress(): string {
    return 'Saving this comparison…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordComparison') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const data = result.data as { candidateCount?: number } | undefined;
    return `Saved the comparison of ${data?.candidateCount ?? 'those'} option${data?.candidateCount === 1 ? '' : 's'}.`;
  }
}

export const recordComparisonPlugin = new RecordComparisonPlugin();
