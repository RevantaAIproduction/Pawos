import { memoryGraphStore, type Entity } from '../../memory/MemoryGraphStore';
import { findFileEntityByPath } from '../../memory/entities/fileEntities';
import { findWorkspaceByName, findWorkspaceByRoot } from '../../memory/entities/workspaceEntities';
import { findCodingProjectByRoot } from '../../memory/entities/codingProjectEntities';
import { findCodingFeatureByName, findCodeFileByPath } from '../../memory/entities/codingFeatureEntities';

/** Resolves a human/LLM-supplied reference (a file path, a workspace name, a project root, a coding feature name, or a raw entity id) into an Entity — a single lookup shared by every Phase C/D plugin that takes an entityRef param instead of a raw id. */
export function resolveEntityRef(ref: string): Entity | undefined {
  return (
    memoryGraphStore.getEntity(ref) ??
    findFileEntityByPath(ref) ??
    findWorkspaceByName(ref) ??
    findWorkspaceByRoot(ref) ??
    findCodingProjectByRoot(ref) ??
    findCodingFeatureByName(ref) ??
    findCodeFileByPath(ref)
  );
}
