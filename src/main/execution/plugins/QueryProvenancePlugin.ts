import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { memoryGraphStore } from '../../memory/MemoryGraphStore';
import { RELATION } from '../../memory/relationVocabulary';
import { resolveEntityRef } from './entityResolve';

/**
 * Thin wrapper over MemoryGraphStore's generic traversal — answers the
 * mission's example questions ("when did I last work on this proposal,"
 * "what meeting created this document," "show me everything related to
 * CareerForge") directly off the graph, never off filenames.
 */
export class QueryProvenancePlugin extends BasePlugin {
  id = 'queryProvenance';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'queryProvenance';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'queryProvenance') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const entity = resolveEntityRef(request.entityRef);
    if (!entity) {
      return { ok: false, reason: 'failed', message: `I don't have anything in memory matching "${request.entityRef}".` };
    }

    switch (request.question) {
      case 'lastWorkedOn': {
        const history = memoryGraphStore.getEntityHistory(entity.id);
        const last = history[history.length - 1];
        return { ok: true, data: { lastTouchedAt: entity.lastUsedAt ?? entity.updatedAt, lastEdge: last } };
      }
      case 'createdFrom': {
        const chain = memoryGraphStore.getProvenanceChain(entity.id, 'from', 3).filter((e) => e.relation === RELATION.GENERATED_FROM || e.relation === RELATION.DERIVED_FROM);
        return { ok: true, data: { chain: chain.map((e) => ({ relation: e.relation, to: memoryGraphStore.getEntity(e.toId)?.attributes })) } };
      }
      case 'relatedTo': {
        const related = memoryGraphStore.getEntityHistory(entity.id).filter((e) => e.active);
        return {
          ok: true,
          data: {
            related: related.map((e) => ({
              relation: e.relation,
              entity: memoryGraphStore.getEntity(e.fromId === entity.id ? e.toId : e.fromId)?.attributes,
            })),
          },
        };
      }
      case 'belongsTo': {
        const belongsTo = memoryGraphStore.getEntityHistory(entity.id).find((e) => e.active && e.fromId === entity.id && e.relation === RELATION.BELONGS_TO);
        return { ok: true, data: { workspace: belongsTo ? memoryGraphStore.getEntity(belongsTo.toId)?.attributes : null } };
      }
      default:
        return { ok: false, reason: 'failed', message: 'Unknown provenance question.' };
    }
  }

  describeInProgress(): string {
    return 'Checking my memory…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'queryProvenance') return result.ok ? 'Done.' : describeFailure(result);
    return result.ok ? "I've checked my memory for that." : describeFailure(result);
  }
}

export const queryProvenancePlugin = new QueryProvenancePlugin();
