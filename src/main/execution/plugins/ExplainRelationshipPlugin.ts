import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { resolveEntityRef } from './entityResolve';

/** "Why do you think this belongs to CareerForge?" — finds the active edge(s) between two entities and returns their stored Inference verbatim. */
export class ExplainRelationshipPlugin extends BasePlugin {
  id = 'explainRelationship';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'explainRelationship';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'explainRelationship') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const from = resolveEntityRef(request.fromRef);
    const to = resolveEntityRef(request.toRef);
    if (!from || !to) {
      return { ok: false, reason: 'failed', message: `I don't have both of those in memory yet.` };
    }

    const edges = memoryGraphStore
      .getEntityHistory(from.id)
      .filter((e) => e.active && ((e.fromId === from.id && e.toId === to.id) || (e.fromId === to.id && e.toId === from.id)));

    if (edges.length === 0) {
      return { ok: true, data: { related: false, message: "I don't have a recorded connection between those." } };
    }

    return {
      ok: true,
      data: {
        related: true,
        relations: edges.map((e) => ({
          relation: e.relation,
          confidence: e.inference?.confidence,
          evidence: e.inference?.evidence,
          reasoningSummary: e.inference?.reasoningSummary,
        })),
      },
    };
  }

  describeInProgress(): string {
    return 'Checking how those connect…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'explainRelationship') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "Here's how those connect in my memory." : describeFailure(result);
  }
}

export const explainRelationshipPlugin = new ExplainRelationshipPlugin();
