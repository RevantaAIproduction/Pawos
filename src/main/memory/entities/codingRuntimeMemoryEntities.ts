import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import { findCodingProjectByRoot } from './codingProjectEntities';
import { upsertCodeFile } from './codingFeatureEntities';

export type CodingEditHistoryAttributes = {
  projectRoot: string;
  description: string;
  filesChanged: string[];
  planId?: string;
  appliedAt: number;
  validationOutcome?: 'passed' | 'failed' | 'unknown';
  commitSha?: string;
};

export type CodingArchitecturalDecisionAttributes = {
  projectRoot: string;
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
  recordedAt: number;
};

export type CodingUserPreferenceScope = 'project' | 'global';

export type CodingUserPreferenceAttributes = {
  scope: CodingUserPreferenceScope;
  projectRoot?: string;
  preferenceKey: string;
  preferenceValue: string;
  recordedAt: number;
};

function normalizeRoot(root: string): string {
  return root.trim().toLowerCase();
}

/** Best-effort link to an existing codingProject entity for this root — never fabricates one; a project that has never been analyzed just gets an unlinked memory entry, same honesty discipline as every other Coding Runtime V2 memory write. */
function linkToProjectIfKnown(entityId: string, projectRoot: string): void {
  const project = findCodingProjectByRoot(projectRoot);
  if (project) memoryGraphStore.link(entityId, project.id, RELATION.BELONGS_TO);
}

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — auto-recorded by the Multi-file Editing Engine
 * (ApplyCodeEditPlugin.verify(), not model-invoked) immediately after an edit is applied and
 * verified. A plain factual log of what happened, not an inference — always creates a new entity,
 * the same "one-off event" pattern as `codingEditRequest`/`codeFile`/`codingValidationReport`, never
 * upserted in place. Every changed file gets a shared `codeFile` entity (reused from
 * codingFeatureEntities.ts) linked via RELATION.MODIFIED, giving ExplainRelationshipPlugin a real
 * "why was this file touched" answer for free.
 */
export function recordCodingEditHistory(
  projectRoot: string,
  description: string,
  filesChanged: string[],
  options?: { planId?: string; validationOutcome?: 'passed' | 'failed' | 'unknown'; commitSha?: string }
): Entity {
  const attributes: CodingEditHistoryAttributes = {
    projectRoot,
    description,
    filesChanged,
    planId: options?.planId,
    appliedAt: Date.now(),
    validationOutcome: options?.validationOutcome,
    commitSha: options?.commitSha,
  };
  const entity = memoryGraphStore.upsertEntity('codingEditHistory', attributes, { changeType: 'created' });
  linkToProjectIfKnown(entity.id, projectRoot);
  for (const filePath of filesChanged) {
    const fileEntity = upsertCodeFile(projectRoot, filePath);
    memoryGraphStore.link(entity.id, fileEntity.id, RELATION.MODIFIED, {
      confidence: 1,
      evidence: [{ source: 'taskExecution', detail: `Edited as part of: ${description}` }],
      reasoningSummary: description,
    });
  }
  return entity;
}

/** Most-recent-first, for the `codingMemory` Workspace region and QueryCodingRuntimeMemoryPlugin. */
export function queryCodingEditHistory(projectRoot: string, limit = 20): Entity[] {
  const target = normalizeRoot(projectRoot);
  return memoryGraphStore
    .queryEntities({ type: 'codingEditHistory', where: (a) => normalizeRoot((a as CodingEditHistoryAttributes).projectRoot) === target })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — model-invoked only, mirroring
 * RecordErrorFixPlugin's discipline exactly: never auto-detected from a diff or commit message,
 * only recorded when the model or user actually articulates a decision and its reasoning. A later
 * decision about the same topic ("we switched from REST to GraphQL") is a *new* decision, not a
 * correction of the old one, so — like `codingEditHistory` — this always creates a new entity,
 * never upserts.
 */
export function recordArchitecturalDecision(
  projectRoot: string,
  decision: string,
  rationale: string,
  alternativesConsidered: string[] = []
): Entity {
  const attributes: CodingArchitecturalDecisionAttributes = { projectRoot, decision, rationale, alternativesConsidered, recordedAt: Date.now() };
  const entity = memoryGraphStore.upsertEntity('codingArchitecturalDecision', attributes, { changeType: 'created' });
  linkToProjectIfKnown(entity.id, projectRoot);
  return entity;
}

export function queryArchitecturalDecisions(projectRoot: string, limit = 20): Entity[] {
  const target = normalizeRoot(projectRoot);
  return memoryGraphStore
    .queryEntities({ type: 'codingArchitecturalDecision', where: (a) => normalizeRoot((a as CodingArchitecturalDecisionAttributes).projectRoot) === target })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

function findCodingPreference(scope: CodingUserPreferenceScope, projectRoot: string | undefined, preferenceKey: string): Entity | undefined {
  const targetRoot = projectRoot ? normalizeRoot(projectRoot) : undefined;
  return memoryGraphStore.queryEntities({
    type: 'codingUserPreference',
    where: (a) => {
      const attrs = a as CodingUserPreferenceAttributes;
      if (attrs.scope !== scope || attrs.preferenceKey !== preferenceKey) return false;
      if (scope === 'global') return true;
      return targetRoot !== undefined && attrs.projectRoot !== undefined && normalizeRoot(attrs.projectRoot) === targetRoot;
    },
  })[0];
}

/**
 * Coding Runtime V2, Coding Runtime Memory (§14) — model-invoked only, never silently inferred from
 * a single observed instance of code style. Unlike `codingEditHistory`/`codingArchitecturalDecision`
 * (one-off event logs), a preference represents *current* state, not a historical event —
 * re-recording the same (scope, projectRoot, preferenceKey) versions the same entity instead of
 * accumulating conflicting duplicate entries for the same key, the same "versioned singleton"
 * pattern `codingFeature`/`codingProject` already established. This is a deliberate design choice:
 * the plan's own entity list didn't specify upsert-vs-append, and "the user's current preference for
 * X" is a fact that should be corrected in place when it changes, not a growing, ambiguous history a
 * future query would have to disambiguate.
 */
export function recordCodingPreference(
  scope: CodingUserPreferenceScope,
  preferenceKey: string,
  preferenceValue: string,
  projectRoot?: string
): Entity {
  const existing = findCodingPreference(scope, projectRoot, preferenceKey);
  const attributes: CodingUserPreferenceAttributes = { scope, projectRoot, preferenceKey, preferenceValue, recordedAt: Date.now() };
  const entity = memoryGraphStore.upsertEntity('codingUserPreference', attributes, {
    id: existing?.id,
    changeType: existing ? 'modified' : 'created',
  });
  // Only link on first creation — memoryGraphStore.link() always creates a new edge with no
  // dedup check, so calling this on every re-recording of the same (scope, projectRoot,
  // preferenceKey) would accumulate a duplicate BELONGS_TO edge each time the value changes.
  if (!existing && scope === 'project' && projectRoot) linkToProjectIfKnown(entity.id, projectRoot);
  return entity;
}

/** Every preference relevant to a project: its own project-scoped preferences plus every global one. */
export function queryCodingPreferences(projectRoot?: string): Entity[] {
  const targetRoot = projectRoot ? normalizeRoot(projectRoot) : undefined;
  return memoryGraphStore.queryEntities({
    type: 'codingUserPreference',
    where: (a) => {
      const attrs = a as CodingUserPreferenceAttributes;
      if (attrs.scope === 'global') return true;
      return targetRoot !== undefined && attrs.projectRoot !== undefined && normalizeRoot(attrs.projectRoot) === targetRoot;
    },
  });
}
