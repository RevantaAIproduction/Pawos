import { memoryGraphStore, type Entity } from '../MemoryGraphStore';

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — a lightweight record of one proposed
 * code-edit batch, minted purely so `ExecutionPlan.sourceReportId` (documented as pointing at an
 * `IntelligenceReport` entity) still points at something real and explainable for a code-edit plan,
 * which has no intelligence report behind it. Unlike `codingFeature` (upserted in place by natural
 * key so re-analysis versions the same entity) or `intelligenceReport` (same), each edit request is
 * its own one-off event — there is no natural key to update in place, so every call always creates a
 * new entity, the same "plain factual log, not a re-analyzable subject" pattern as `codeFile`.
 */
export type CodingEditRequestAttributes = {
  description: string;
  filePaths: string[];
  requestedAt: number;
};

export function recordCodingEditRequest(description: string, filePaths: string[]): Entity {
  const attributes: CodingEditRequestAttributes = { description, filePaths, requestedAt: Date.now() };
  return memoryGraphStore.upsertEntity('codingEditRequest', attributes, { changeType: 'created' });
}
