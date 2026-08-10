import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { recordArchitecturalDecision } from '../../memory/entities/codingRuntimeMemoryEntities';

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — model-invoked only, mirroring
 * RecordErrorFixPlugin's discipline exactly: never auto-detected from a diff or commit message,
 * only recorded once the model or user has actually articulated a decision and its reasoning.
 */
export class RecordArchitecturalDecisionPlugin extends BasePlugin {
  id = 'recordArchitecturalDecision';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'recordArchitecturalDecision';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'recordArchitecturalDecision') return [];
    if (!request.decision.trim() || !request.rationale.trim()) {
      return [{ id: 'incomplete-decision', message: 'What was decided, and why?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'recordArchitecturalDecision') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = recordArchitecturalDecision(request.rootPath, request.decision, request.rationale, request.alternativesConsidered ?? []);
    return { ok: true, data: { id: entity.id } };
  }

  describeInProgress(): string {
    return 'Remembering that decision…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'recordArchitecturalDecision') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I'll remember that decision for this project." : describeFailure(result);
  }
}

export const recordArchitecturalDecisionPlugin = new RecordArchitecturalDecisionPlugin();
