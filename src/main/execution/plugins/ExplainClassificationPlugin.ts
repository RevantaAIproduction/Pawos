import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { resolveEntityRef } from './entityResolve';

/** "Why did you classify this as a proposal?" — returns the stored Inference verbatim (evidence + reasoningSummary), never re-justified on the fly. */
export class ExplainClassificationPlugin extends BasePlugin {
  id = 'explainClassification';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'explainClassification';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'explainClassification') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = resolveEntityRef(request.entityRef);
    if (!entity) return { ok: false, reason: 'failed', message: `I don't have anything in memory matching "${request.entityRef}".` };

    const inference = memoryGraphStore.explain(entity.id);
    if (!inference) {
      return { ok: true, data: { hasInference: false, message: 'That was set directly, not inferred — nothing to explain.' } };
    }
    return { ok: true, data: { hasInference: true, confidence: inference.confidence, evidence: inference.evidence, reasoningSummary: inference.reasoningSummary } };
  }

  describeInProgress(): string {
    return 'Checking why I classified that…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'explainClassification') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Here's why I classified that the way I did." : describeFailure(result);
  }
}

export const explainClassificationPlugin = new ExplainClassificationPlugin();
