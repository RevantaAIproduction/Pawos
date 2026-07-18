import { memoryGraphStore, type Entity, type Inference } from '../MemoryGraphStore';
import { RELATION } from '../relationVocabulary';
import { findWorkspaceForPath } from './workspaceEntities';

export type FileDocType =
  | 'resume'
  | 'proposal'
  | 'invoice'
  | 'contract'
  | 'meeting-notes'
  | 'presentation'
  | 'design'
  | 'research'
  | 'code'
  | 'requirements'
  | 'other';

export type FileMentions = { people: string[]; clients: string[]; projects: string[] };

export type FileAttributes = {
  path: string;
  docType: FileDocType;
  summary: string;
  tags: string[];
  mentions: FileMentions;
  contentHash?: string;
  mtime?: number;
  lastIndexedAt?: number;
};

const UNCLASSIFIED: Omit<FileAttributes, 'path'> = {
  docType: 'other',
  summary: '',
  tags: [],
  mentions: { people: [], clients: [], projects: [] },
};

function normalize(p: string): string {
  return p.trim().toLowerCase();
}

export function findFileEntityByPath(filePath: string): Entity | undefined {
  const target = normalize(filePath);
  return memoryGraphStore.queryEntities({ type: 'file', where: (a) => normalize((a as FileAttributes).path) === target })[0];
}

export function findFilesByDocType(docType: FileDocType): Entity[] {
  return memoryGraphStore.queryEntities({ type: 'file', where: (a) => (a as FileAttributes).docType === docType });
}

function linkFileToWorkspace(fileId: string, filePath: string): void {
  const workspace = findWorkspaceForPath(filePath);
  if (!workspace) return;
  // Supersede any prior BELONGS_TO edge from this file before adding the current one, so a moved file never appears to belong to two workspaces at once.
  for (const edge of memoryGraphStore.getAllEdgesFor(fileId)) {
    if (edge.active && edge.fromId === fileId && edge.relation === RELATION.BELONGS_TO) memoryGraphStore.supersede(edge.id);
  }
  memoryGraphStore.link(fileId, workspace.id, RELATION.BELONGS_TO, {
    confidence: 1,
    evidence: [{ source: 'taskExecution', detail: `File path falls under workspace root "${(workspace.attributes as { name: string }).name}"` }],
    reasoningSummary: 'Belongs to this workspace because its path is under one of the workspace\'s root folders.',
  });
}

/** Upserts a file's classification (docType/summary/tags/mentions) — called by fileClassifier.ts after reading + classifying content. Never creates a second entity for a path already indexed; updates the existing one (bumping version) instead. */
export function upsertFileEntity(attributes: FileAttributes, inference?: Inference): Entity {
  const existing = findFileEntityByPath(attributes.path);
  const entity = memoryGraphStore.upsertEntity('file', attributes, {
    id: existing?.id,
    inference,
    changeType: existing ? 'modified' : 'created',
  });
  linkFileToWorkspace(entity.id, attributes.path);
  return entity;
}

// ---- Incremental lifecycle hooks — plugins call these directly instead of
// ever re-indexing. Each touches only the one entity it concerns and the
// edges that entity actually participates in. ----

/** A brand-new file Paw just created (or first became aware of) — starts unclassified; classification happens lazily on the next relevant query, never eagerly for every file created. */
export function onFileCreated(filePath: string): Entity {
  const entity = memoryGraphStore.upsertEntity(
    'file',
    { ...UNCLASSIFIED, path: filePath },
    { changeType: 'created' }
  );
  linkFileToWorkspace(entity.id, filePath);
  return entity;
}

/** Content changed (Paw's own writeFile, or an external edit caught by the file watcher) — marks the entity stale for lazy reclassification rather than reclassifying immediately. */
export function onFileModified(filePath: string): Entity | undefined {
  const existing = findFileEntityByPath(filePath);
  if (!existing) return onFileCreated(filePath);
  const attrs = existing.attributes as FileAttributes;
  return memoryGraphStore.upsertEntity(
    'file',
    { ...attrs, contentHash: undefined, lastIndexedAt: undefined },
    { id: existing.id, changeType: 'modified' }
  );
}

/** Move and rename share this — fs.rename treats them identically, and so does the graph: the SAME entity id survives, only its `path` attribute changes. This is what makes identity stable across any number of renames/moves. */
function onFileRelocated(fromPath: string, toPath: string, changeType: 'moved' | 'renamed'): Entity | undefined {
  const existing = findFileEntityByPath(fromPath);
  if (!existing) return onFileCreated(toPath);
  const attrs = existing.attributes as FileAttributes;
  const updated = memoryGraphStore.upsertEntity(
    'file',
    { ...attrs, path: toPath },
    { id: existing.id, changeType, changeDetail: `${changeType} from "${fromPath}" to "${toPath}"` }
  );
  linkFileToWorkspace(updated.id, toPath);
  return updated;
}

export function onFileMoved(fromPath: string, toPath: string): Entity | undefined {
  return onFileRelocated(fromPath, toPath, 'moved');
}

export function onFileRenamed(fromPath: string, toPath: string): Entity | undefined {
  return onFileRelocated(fromPath, toPath, 'renamed');
}

/** The entity is never removed — only its active structural edges are superseded, matching "never overwrite knowledge." */
export function onFileDeleted(filePath: string): Entity | undefined {
  const existing = findFileEntityByPath(filePath);
  if (!existing) return undefined;
  for (const edge of memoryGraphStore.getAllEdgesFor(existing.id)) {
    if (edge.active) memoryGraphStore.supersede(edge.id);
  }
  return memoryGraphStore.upsertEntity('file', existing.attributes, { id: existing.id, changeType: 'deleted' });
}

/** Reactivates the edges superseded by onFileDeleted (rather than fabricating fresh ones) — restoring the file also restores its provenance history. */
export function onFileRestored(filePath: string): Entity | undefined {
  const existing = findFileEntityByPath(filePath);
  if (!existing) return undefined;
  for (const edge of memoryGraphStore.getAllEdgesFor(existing.id)) {
    if (!edge.active) memoryGraphStore.reactivate(edge.id);
  }
  return memoryGraphStore.upsertEntity('file', existing.attributes, { id: existing.id, changeType: 'restored' });
}

export function touchFileUsed(filePath: string): void {
  const existing = findFileEntityByPath(filePath);
  if (existing) memoryGraphStore.touchLastUsed(existing.id);
}
