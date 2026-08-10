import { describe, expect, it } from 'vitest';
import type { ConversationTaskAction, ConversationTaskRecord } from '../conversation/ConversationTypes';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import {
  getCodingWorkspaceRoots,
  getLatestActiveFilePath,
  getLatestCodingWorkspaceRoot,
  getPathBasename,
  getPathDirname,
  joinWorkspacePath,
  sortDirectoryEntries,
} from './codingWorkspaceModel';

function makeAction(request: ActionRequest): ConversationTaskAction {
  return {
    id: `a-${request.type}`,
    type: request.type,
    request,
    startedAt: 0,
    endedAt: 1,
    inProgressText: '',
  };
}

function makeTask(actions: ConversationTaskAction[]): ConversationTaskRecord {
  return { id: 't1', goal: 'test', status: 'running', startedAt: 0, endedAt: null, actions };
}

describe('codingWorkspaceModel', () => {
  it('derives unique project roots from existing action payloads', () => {
    const task = makeTask([
      makeAction({ type: 'analyzeProjectStructure', rootPath: 'C:\\repo' }),
      makeAction({ type: 'runCommand', cwd: 'C:/repo', command: 'npm test' }),
      makeAction({ type: 'gitStatus', cwd: 'D:/other' }),
    ]);

    expect(getCodingWorkspaceRoots(task)).toEqual(['C:\\repo', 'D:/other']);
    expect(getLatestCodingWorkspaceRoot(task)).toBe('D:/other');
  });

  it('finds the latest active file path without inventing one from folders', () => {
    const task = makeTask([
      makeAction({ type: 'openFolder', path: 'C:/repo/src' }),
      makeAction({ type: 'readFile', path: 'C:/repo/src/App.tsx' }),
      makeAction({ type: 'applyCodeEdit', path: 'C:/repo/src/index.ts', edits: [] }),
    ]);

    expect(getLatestActiveFilePath(task)).toBe('C:/repo/src/index.ts');
  });

  it('handles path labels and parent paths for Windows and POSIX separators', () => {
    expect(getPathBasename('C:\\repo\\src\\App.tsx')).toBe('App.tsx');
    expect(getPathDirname('C:\\repo\\src\\App.tsx')).toBe('C:/repo/src');
    expect(joinWorkspacePath('C:\\repo', 'src')).toBe('C:\\repo\\src');
    expect(joinWorkspacePath('/repo', 'src')).toBe('/repo/src');
  });

  it('sorts folders before files and then by display name', () => {
    expect(
      sortDirectoryEntries([
        { name: 'z.ts', isDirectory: false, size: 10 },
        { name: 'components', isDirectory: true, size: null },
        { name: 'a.ts', isDirectory: false, size: 10 },
        { name: 'assets', isDirectory: true, size: null },
      ]).map((entry) => entry.name)
    ).toEqual(['assets', 'components', 'a.ts', 'z.ts']);
  });
});
