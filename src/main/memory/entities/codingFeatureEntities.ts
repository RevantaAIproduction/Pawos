import { memoryGraphStore, type Entity, type Inference } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import type { CodingFeature } from '../../execution/FeatureMapBuilder';

export type CodingFeatureAttributes = {
  projectRoot: string;
  name: string;
  routeFiles: string[];
  componentFiles: string[];
  dataModelFiles: string[];
  configFiles: string[];
  testFiles: string[];
  method: string;
};

/** A single real project file that implements part of a codingFeature — deliberately minimal (path-only, no content, no code-specific analysis) since it exists purely as a link target for RELATION.IMPLEMENTED_BY, not a second copy of anything DependencyGraphCache already owns. */
export type CodeFileAttributes = {
  projectRoot: string;
  path: string;
};

function normalizeRoot(root: string): string {
  return root.trim().toLowerCase();
}

export function findCodingFeature(projectRoot: string, name: string): Entity | undefined {
  const targetRoot = normalizeRoot(projectRoot);
  return memoryGraphStore.queryEntities({
    type: 'codingFeature',
    where: (a) => normalizeRoot((a as CodingFeatureAttributes).projectRoot) === targetRoot && (a as CodingFeatureAttributes).name === name,
  })[0];
}

export function findCodeFile(projectRoot: string, filePath: string): Entity | undefined {
  const targetRoot = normalizeRoot(projectRoot);
  return memoryGraphStore.queryEntities({
    type: 'codeFile',
    where: (a) => normalizeRoot((a as CodeFileAttributes).projectRoot) === targetRoot && (a as CodeFileAttributes).path === filePath,
  })[0];
}

/** Global path-only lookup (no projectRoot scoping) — same convention as fileEntities.ts's findFileEntityByPath — so a codeFile entity is resolvable by a bare relative path via resolveEntityRef, the way file/workspace/coding-project entities already are. Ambiguous only if the same relative path exists in more than one indexed project, the same tradeoff findFileEntityByPath already accepts for its own entity type. */
export function findCodeFileByPath(filePath: string): Entity | undefined {
  return memoryGraphStore.queryEntities({ type: 'codeFile', where: (a) => (a as CodeFileAttributes).path === filePath })[0];
}

/** Global name-only lookup (no projectRoot scoping), mirroring workspaceEntities.ts's findWorkspaceByName — so a codingFeature entity is resolvable by its bare name via resolveEntityRef. */
export function findCodingFeatureByName(name: string): Entity | undefined {
  const target = name.trim().toLowerCase();
  return memoryGraphStore.queryEntities({ type: 'codingFeature' }).find((e) => (e.attributes as CodingFeatureAttributes).name.toLowerCase() === target);
}

/** Exported for reuse by codingRuntimeMemoryEntities.ts (§14), which links codingEditHistory entities to the same codeFile entities via RELATION.MODIFIED — sharing one codeFile per (projectRoot, path) rather than each memory kind minting its own duplicate. */
export function upsertCodeFile(projectRoot: string, filePath: string): Entity {
  const existing = findCodeFile(projectRoot, filePath);
  return memoryGraphStore.upsertEntity(
    'codeFile',
    { projectRoot, path: filePath },
    { id: existing?.id, changeType: existing ? 'modified' : 'created' }
  );
}

/**
 * Matched and updated by (projectRoot, name) — same natural-key convention as
 * codingProjectEntities.ts's root match — so re-running Feature Discovery on the same project
 * versions the same entities instead of creating duplicates. Every constituent file gets a
 * lightweight codeFile entity (upserted, not duplicated) linked via RELATION.IMPLEMENTED_BY, giving
 * ExplainRelationshipPlugin real per-file "why is this file part of this feature" answers without
 * a second copy of the dependency graph's own edge data.
 */
export function upsertCodingFeature(feature: CodingFeature, projectRoot: string, inference: Inference): Entity {
  const existing = findCodingFeature(projectRoot, feature.name);
  const attributes: CodingFeatureAttributes = {
    projectRoot,
    name: feature.name,
    routeFiles: feature.routeFiles,
    componentFiles: feature.componentFiles,
    dataModelFiles: feature.dataModelFiles,
    configFiles: feature.configFiles,
    testFiles: feature.testFiles,
    method: feature.method,
  };
  const entity = memoryGraphStore.upsertEntity('codingFeature', attributes, {
    id: existing?.id,
    changeType: existing ? 'modified' : 'created',
    inference,
  });

  // Supersede every prior IMPLEMENTED_BY edge from this feature before relinking — the same
  // "never accumulate duplicate structural edges on re-analysis" convention fileEntities.ts's
  // linkFileToWorkspace() already establishes. Without this, re-running Feature Discovery on an
  // unchanged project would add a fresh duplicate edge to the same file every single time.
  for (const edge of memoryGraphStore.getAllEdgesFor(entity.id)) {
    if (edge.active && edge.fromId === entity.id && edge.relation === RELATION.IMPLEMENTED_BY) memoryGraphStore.supersede(edge.id);
  }

  const allFiles = [...feature.routeFiles, ...feature.componentFiles, ...feature.dataModelFiles, ...feature.configFiles, ...feature.testFiles];
  for (const filePath of allFiles) {
    const fileEntity = upsertCodeFile(projectRoot, filePath);
    memoryGraphStore.link(entity.id, fileEntity.id, RELATION.IMPLEMENTED_BY, {
      confidence: feature.confidence,
      evidence: [{ source: 'taskExecution', detail: `Clustered into feature "${feature.name}" via ${feature.method}.` }],
      reasoningSummary: `Part of the "${feature.name}" feature (${feature.method}).`,
    });
  }

  return entity;
}
