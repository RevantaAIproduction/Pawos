import { memoryGraphStore, type Entity } from '../MemoryGraphStore';
import type { ProjectFileTreeNode } from '../../execution/ProjectMapBuilder';

export type CodingProjectAttributes = {
  root: string;
  workspaceName: string;
  framework: string | null;
  language: string;
  packageManager: string;
  buildTool: string | null;
  git: { isRepo: boolean; remoteUrl?: string };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  entryPoint: string | null;
  fileTree: ProjectFileTreeNode[];
  fileTreeTruncated: boolean;
};

function normalize(root: string): string {
  return root.trim().toLowerCase();
}

export function findCodingProjectByRoot(root: string): Entity | undefined {
  const target = normalize(root);
  return memoryGraphStore.queryEntities({ type: 'codingProject', where: (a) => normalize((a as CodingProjectAttributes).root) === target })[0];
}

/** Matched and updated by root path (same natural-key convention as comparisonEntities.ts's topic match) — re-analyzing the same project versions the same entity instead of creating duplicates. */
export function upsertCodingProject(attributes: CodingProjectAttributes): Entity {
  const existing = findCodingProjectByRoot(attributes.root);
  return memoryGraphStore.upsertEntity('codingProject', attributes, {
    id: existing?.id,
    changeType: existing ? 'modified' : 'created',
  });
}
