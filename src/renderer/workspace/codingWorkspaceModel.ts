import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { ConversationTaskRecord } from '../conversation/ConversationTypes';

export type CodingWorkspaceDirEntry = {
  name: string;
  isDirectory: boolean;
  size: number | null;
};

export function normalizeWorkspacePath(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function getPathBasename(input: string): string {
  const normalized = normalizeWorkspacePath(input);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

export function getPathDirname(input: string): string {
  const normalized = normalizeWorkspacePath(input);
  const slash = normalized.lastIndexOf('/');
  if (slash <= 0) return normalized;
  return normalized.slice(0, slash);
}

export function joinWorkspacePath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${child}`;
}

function actionProjectRoot(request: ActionRequest): string | undefined {
  if ('rootPath' in request && typeof request.rootPath === 'string') return request.rootPath;
  if ('cwd' in request && typeof request.cwd === 'string') return request.cwd;
  if ('projectRoot' in request && typeof request.projectRoot === 'string') return request.projectRoot;
  if ('repoPath' in request && typeof request.repoPath === 'string') return request.repoPath;
  return undefined;
}

export function getCodingWorkspaceRoots(task: ConversationTaskRecord): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  for (const action of task.actions) {
    const root = actionProjectRoot(action.request);
    if (!root) continue;
    const normalized = normalizeWorkspacePath(root).toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    roots.push(root);
  }
  return roots;
}

export function getLatestCodingWorkspaceRoot(task: ConversationTaskRecord): string | undefined {
  const roots = getCodingWorkspaceRoots(task);
  return roots[roots.length - 1];
}

export function getLatestActiveFilePath(task: ConversationTaskRecord): string | undefined {
  for (const action of [...task.actions].reverse()) {
    const request = action.request;
    if ('filePath' in request && typeof request.filePath === 'string') return request.filePath;
    if ('path' in request && typeof request.path === 'string') {
      if (request.type === 'readFile' || request.type === 'writeFile' || request.type === 'applyCodeEdit' || request.type === 'openFile') {
        return request.path;
      }
    }
  }
  return undefined;
}

export function sortDirectoryEntries(entries: CodingWorkspaceDirEntry[]): CodingWorkspaceDirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
