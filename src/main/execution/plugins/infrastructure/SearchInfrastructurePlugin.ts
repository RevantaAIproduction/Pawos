import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { memoryGraphStore } from '../../../memory/MemoryGraphStore';
import { labelFor } from './GetInfrastructureGraphSummaryPlugin';

const INFRA_ENTITY_TYPES = [
  'organization', 'project', 'repository', 'branch', 'service', 'api', 'deployment',
  'database', 'kubernetesCluster', 'container', 'loadBalancer', 'domain', 'storage',
  'queue', 'cicdPipeline', 'incident', 'secret', 'environmentVariable',
];

export type InfraSearchHit = { type: string; label: string };

/**
 * Infrastructure Search — a real substring search across every registered
 * infrastructure entity (reuses MemoryGraphStore's own generic search, same
 * one explain_relationship/query_provenance build on). `secret`/
 * `environmentVariable` entities only ever store a name/key, never a value
 * (see recordSecretMetadata/recordEnvironmentVariableMetadata) — so
 * including them in results never exposes anything beyond that metadata.
 * Never gated, read-only.
 */
export class SearchInfrastructurePlugin extends BasePlugin {
  id = 'searchInfrastructure';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'searchInfrastructure';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'searchInfrastructure') return [];
    if (!request.query.trim()) return [{ id: 'query-missing', message: 'What should I search the infrastructure graph for?' }];
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'searchInfrastructure') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    const hits: InfraSearchHit[] = INFRA_ENTITY_TYPES.flatMap((type) =>
      memoryGraphStore.search(request.query, type).map((e) => ({ type, label: labelFor(e.attributes) }))
    );
    return { ok: true, data: { query: request.query, hits } };
  }

  describeInProgress(): string {
    return 'Searching infrastructure…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (!result.ok) return describeFailure(result);
    const data = result.data as { query: string; hits: InfraSearchHit[] };
    return data.hits.length > 0 ? `Found ${data.hits.length} match(es) for "${data.query}".` : `No infrastructure matches found for "${data.query}".`;
  }
}

export const searchInfrastructurePlugin = new SearchInfrastructurePlugin();
