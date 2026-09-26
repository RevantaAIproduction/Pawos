import type { ActionRequest } from '../../shared/actions/ActionTypes';
import { isInsideFolder } from './projectClone';

/**
 * Inside the project the user opened, looking is trusted: reading, listing, searching and read-only
 * git queries run without the "I need permission to…" question. Anything that changes something
 * (writes, edits, moves, deletes, commands, git commits/branches, installs) — and any read OUTSIDE
 * the open project — still asks in chat first.
 */
const READ_ONLY_ACTIONS = new Set([
  'readFile', 'listDirectory', 'searchFiles', 'findFileSemantic', 'analyzeProject', 'analyzeProjectStructure',
  'analyzeFolder', 'findDuplicateFiles', 'getWorkspaceBundle', 'explainClassification',
  'gitStatus', 'gitDiff', 'gitDiffStat', 'gitLog', 'gitBranch', 'gitShow',
]);

function locationsOf(request: ActionRequest): string[] {
  const r = request as unknown as Record<string, unknown>;
  return ['path', 'rootPath', 'cwd']
    .map((key) => r[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/** True when this is a read-only action whose every location is inside the open project. */
export function isTrustedProjectRead(request: ActionRequest, projectFolder: string | null | undefined): boolean {
  if (!projectFolder || !READ_ONLY_ACTIONS.has(request.type)) return false;
  const locations = locationsOf(request);
  return locations.length > 0 && locations.every((location) => isInsideFolder(location, projectFolder));
}
