import { describe, expect, it } from 'vitest';
import { agentChangedProject, agentIsBusy, createPrRequest, summarizeDiff } from './projectBarModel';
import type { ConversationTaskRecord } from './ConversationTypes';

const task = (actions: ConversationTaskRecord['actions'], status: ConversationTaskRecord['status'] = 'completed'): ConversationTaskRecord => ({
  id: Math.random().toString(), goal: 'g', status, startedAt: 1, endedAt: 2, actions,
});
const action = (type: string, request: Record<string, unknown>, ok = true) => ({
  id: Math.random().toString(), type, request: { type, ...request } as never, result: { ok } as never, startedAt: 1, endedAt: 2, inProgressText: '',
});
const project = 'C:\\code\\my-app';

describe('Project bar: line counts and Create PR only after the agent coded in THIS project', () => {
  it('a successful edit inside the project counts', () => {
    expect(agentChangedProject([task([action('writeFile', { path: 'C:\\code\\my-app\\src\\App.tsx', content: 'x' })])], project)).toBe(true);
    expect(agentChangedProject([task([action('applyCodeEdit', { path: 'c:/code/my-app/src/a.ts', edits: [] })])], project)).toBe(true);
  });

  it.each([
    ['reads / searches only', [action('readFile', { path: 'C:\\code\\my-app\\src\\App.tsx' }), action('searchFiles', { rootPath: project, query: 'x' })]],
    ['a failed write', [action('writeFile', { path: 'C:\\code\\my-app\\a.ts', content: 'x' }, false)]],
    ['a write outside the project (e.g. a resume)', [action('writeFile', { path: 'C:\\Users\\me\\Documents\\Resume.md', content: 'x' })]],
    ['a look-alike folder', [action('writeFile', { path: 'C:\\code\\my-app2\\a.ts', content: 'x' })]],
  ])('does not count: %s', (_label, actions) => {
    expect(agentChangedProject([task(actions)], project)).toBe(false);
  });

  it('no project open → never', () => {
    expect(agentChangedProject([task([action('writeFile', { path: 'C:\\code\\my-app\\a.ts', content: 'x' })])], null)).toBe(false);
  });
});

describe('Create PR is silver while the agent works', () => {
  it.each([
    [{ state: 'thinking' as const, pendingConfirmation: false }, true],
    [{ state: 'performingAction' as const, pendingConfirmation: false }, true],
    [{ state: 'idle' as const, pendingConfirmation: true }, true], // waiting for "allow"
    [{ state: 'idle' as const, pendingConfirmation: false, taskHistory: [task([], 'running')] }, true],
    [{ state: 'idle' as const, pendingConfirmation: false, taskHistory: [task([], 'completed')] }, false],
    [{ state: 'completed' as const, pendingConfirmation: false }, false],
  ])('%j → busy %s', (snapshot, busy) => expect(agentIsBusy(snapshot)).toBe(busy));
});

describe('helpers', () => {
  it('summarizes git diff stats', () => {
    expect(summarizeDiff({ filesChanged: [{}, {}], totalAdded: 375, totalDeleted: 29 })).toEqual({ files: 2, added: 375, deleted: 29 });
    expect(summarizeDiff(null)).toBeNull();
  });

  it('the PR request branches off main/master first, and names each step (all asked with "allow")', () => {
    expect(createPrRequest(project, 'main')).toContain('First create a new branch');
    expect(createPrRequest(project, 'feature/login')).not.toContain('First create a new branch');
    expect(createPrRequest(project, 'feature/login')).toContain('gh pr create');
  });
});
