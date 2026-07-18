import { memoryGraphStore, type Entity } from '../MemoryGraphStore';

export type WorkspaceKind = 'project' | 'business' | 'personal' | 'learning';

export type WorkspaceAttributes = {
  name: string;
  kind: WorkspaceKind;
  rootPaths: string[];
  description?: string;
};

function normalize(p: string): string {
  return p.trim().toLowerCase();
}

export function findWorkspaceByRoot(rootPath: string): Entity | undefined {
  const target = normalize(rootPath);
  return memoryGraphStore
    .queryEntities({ type: 'workspace' })
    .find((e) => ((e.attributes as WorkspaceAttributes).rootPaths ?? []).some((r) => normalize(r) === target));
}

export function findWorkspaceByName(name: string): Entity | undefined {
  const target = name.trim().toLowerCase();
  return memoryGraphStore.queryEntities({ type: 'workspace' }).find((e) => (e.attributes as WorkspaceAttributes).name.toLowerCase() === target);
}

export function upsertWorkspace(name: string, kind: WorkspaceKind, rootPaths: string[], description?: string): Entity {
  const existing = findWorkspaceByName(name) ?? rootPaths.map(findWorkspaceByRoot).find((e): e is Entity => Boolean(e));
  const attributes: WorkspaceAttributes = { name, kind, rootPaths, description };
  return memoryGraphStore.upsertEntity('workspace', attributes, { id: existing?.id, changeType: existing ? 'modified' : 'created' });
}

/** Every file belonging to a workspace still touches the disk root(s) under it — used to infer which workspace a newly-created file belongs to. */
export function findWorkspaceForPath(filePath: string): Entity | undefined {
  const target = normalize(filePath);
  const workspaces = memoryGraphStore.queryEntities({ type: 'workspace' });
  return workspaces.find((e) => ((e.attributes as WorkspaceAttributes).rootPaths ?? []).some((root) => target.startsWith(normalize(root))));
}
