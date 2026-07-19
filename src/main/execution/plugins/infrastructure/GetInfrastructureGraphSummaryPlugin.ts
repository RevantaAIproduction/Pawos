import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { findService } from '../../../memory/entities/infrastructureEntities';

export type InfraGraphEdgeSummary = { direction: 'outgoing' | 'incoming'; relation: string; otherType: string; otherLabel: string };
export type InfraGraphSummary = { serviceName: string; edges: InfraGraphEdgeSummary[] };

/** Best-effort label for any infra entity — no per-type formatting table, just the most identifying string field it can find. */
export function labelFor(attributes: Record<string, unknown>): string {
  const candidate = attributes.name ?? attributes.fullName ?? attributes.hostname ?? attributes.title ?? attributes.deploymentId ?? attributes.key;
  return typeof candidate === 'string' ? candidate : JSON.stringify(attributes).slice(0, 40);
}

/**
 * Read-only "how does this service relate to everything else I know about" —
 * reuses the generic MemoryGraphStore query surface (same one
 * explain_relationship/query_provenance already use for any entity type),
 * just packaged as a one-call summary for the Workspace UI's Infrastructure
 * Graph region. Never gated, never fabricates a relationship that isn't a
 * real stored edge.
 */
export class GetInfrastructureGraphSummaryPlugin extends BasePlugin {
  id = 'getInfrastructureGraphSummary';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'getInfrastructureGraphSummary';
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'getInfrastructureGraphSummary') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const service = findService(request.serviceName);
    if (!service) return { ok: false, reason: 'failed', message: `No registered service named "${request.serviceName}".` };

    const edges = memoryGraphStore
      .getAllEdgesFor(service.id)
      .filter((e) => e.active)
      .map((e): InfraGraphEdgeSummary | undefined => {
        const outgoing = e.fromId === service.id;
        const otherId = outgoing ? e.toId : e.fromId;
        const otherType = outgoing ? e.toType : e.fromType;
        const other = memoryGraphStore.getEntity(otherId);
        if (!other) return undefined;
        return { direction: outgoing ? 'outgoing' : 'incoming', relation: e.relation, otherType, otherLabel: labelFor(other.attributes) };
      })
      .filter((e): e is InfraGraphEdgeSummary => Boolean(e));

    const summary: InfraGraphSummary = { serviceName: request.serviceName, edges };
    return { ok: true, data: summary };
  }

  describeInProgress(): string {
    return 'Mapping infrastructure relationships…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as InfraGraphSummary;
    return data.edges.length > 0 ? `${data.edges.length} known relationship(s) for "${data.serviceName}".` : `No recorded relationships for "${data.serviceName}" yet.`;
  }
}

export const getInfrastructureGraphSummaryPlugin = new GetInfrastructureGraphSummaryPlugin();
