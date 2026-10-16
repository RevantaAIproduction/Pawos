import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CodeChangeDiff, CodeChangeEntry, CodeChangeSummary } from '../../../shared/actions/CodeChangeTypes';
import { revertAvailability } from '../../../shared/actions/CodeChangeTypes';

vi.mock('../../services/ipc/ipcBridgeImplementation', () => ({ ipc: { codeChangesDiff: vi.fn(), codeChangesRevert: vi.fn() } }));

import { buildDiffRows, groupChangedFiles, toUnifiedDiff } from './diffViewModel';
import { colorLine, colorLines, languageForPath } from './syntaxColorizer';
import { ChangesView, taskInProject } from './ChangesView';
import type { TaskCenterEntry } from '../tasksCenterModel';

/** The Changes view: diff rows, file grouping, colorizer, revert availability, and its rendering. */

type Ok = Extract<CodeChangeDiff, { ok: true }>;
const diffOf = (hunks: Ok['hunks']): Ok => ({ ok: true, path: 'src/a.ts', originalPath: 'src/a.ts', status: 'modified', hunks, added: 1, removed: 1, truncated: false });

describe('diff rows', () => {
  it('line numbers, kinds and a gap for the unchanged lines before a hunk', () => {
    const rows = buildDiffRows(
      diffOf([
        {
          oldStart: 10,
          oldLines: 3,
          newStart: 10,
          newLines: 3,
          lines: [
            { kind: 'context', text: 'const a = 1;', oldLine: 10, newLine: 10 },
            { kind: 'remove', text: 'const enabled = false;', oldLine: 11, newLine: null },
            { kind: 'add', text: 'const enabled = true;', oldLine: null, newLine: 11 },
            { kind: 'context', text: 'const b = 2;', oldLine: 12, newLine: 12 },
          ],
        },
      ]),
      'ts'
    );
    expect(rows[0]).toMatchObject({ kind: 'gap', hidden: 9, groupId: null });
    expect(rows[1]).toMatchObject({ kind: 'hunk', header: '@@ -10,3 +10,3 @@' });
    const lines = rows.filter((r) => r.kind === 'line');
    expect(lines.map((r) => r.kind === 'line' && [r.line.kind, r.line.oldLine, r.line.newLine])).toEqual([
      ['context', 10, 10],
      ['remove', 11, null],
      ['add', null, 11],
      ['context', 12, 12],
    ]);
    // Colored: `const` is a keyword, `true` a keyword, `1` a number.
    const added = lines[2];
    expect(added.kind === 'line' && added.tokens.find((t) => t.text === 'const')?.kind).toBe('keyword');
  });

  it('in full-file mode, long unchanged runs collapse (keeping 3 lines of context) and can be expanded', () => {
    const context = Array.from({ length: 20 }, (_, i) => ({ kind: 'context' as const, text: `line ${i + 1}`, oldLine: i + 1, newLine: i + 1 }));
    const hunk = {
      oldStart: 1,
      oldLines: 21,
      newStart: 1,
      newLines: 21,
      lines: [...context.slice(0, 10), { kind: 'remove' as const, text: 'x', oldLine: 11, newLine: null }, { kind: 'add' as const, text: 'y', oldLine: null, newLine: 11 }, ...context.slice(10)],
    };
    const collapsed = buildDiffRows(diffOf([hunk]), 'plain');
    const gaps = collapsed.filter((r) => r.kind === 'gap');
    expect(gaps.map((g) => g.kind === 'gap' && g.hidden)).toEqual([7, 7]);
    const groupId = gaps[0].kind === 'gap' ? gaps[0].groupId! : '';
    const expanded = buildDiffRows(diffOf([hunk]), 'plain', new Set([groupId]));
    expect(expanded.filter((r) => r.kind === 'gap')).toHaveLength(1);
  });

  it('copy as a unified diff', () => {
    const text = toUnifiedDiff(diffOf([{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [{ kind: 'remove', text: 'a', oldLine: 1, newLine: null }, { kind: 'add', text: 'b', oldLine: null, newLine: 1 }] }]));
    expect(text).toBe('--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n');
  });
});

const snap = (exists: boolean, content: 'stored' | 'hidden' | 'none' = exists ? 'stored' : 'none') => ({ exists, hash: exists ? 'h' : null, size: exists ? 1 : null, content });
const entry = (path: string, status: CodeChangeEntry['status'], extra: Partial<CodeChangeEntry> = {}): CodeChangeEntry => ({
  path,
  originalPath: path,
  baseline: snap(status !== 'created'),
  final: snap(status !== 'deleted'),
  status,
  added: 1,
  removed: 1,
  lastSeq: 1,
  updatedAt: 1,
  ...extra,
});

describe('changed-file list', () => {
  const entries = [
    entry('src/b.ts', 'modified'),
    entry('src/new.ts', 'created'),
    entry('old.ts', 'deleted'),
    entry('lib/moved.ts', 'renamed', { originalPath: 'src/moved.ts' }),
    entry('same.ts', 'unchanged'),
    entry('undone.ts', 'unchanged', { revertedAt: 5 }),
  ];

  it('groups by what happened; net-unchanged files are left out unless reverted', () => {
    expect(groupChangedFiles(entries, '').map((g) => [g.id, g.entries.map((e) => e.path)])).toEqual([
      ['created', ['src/new.ts']],
      ['modified', ['src/b.ts']],
      ['renamed', ['lib/moved.ts']],
      ['deleted', ['old.ts']],
      ['reverted', ['undone.ts']],
    ]);
  });

  it('filters by name, including a renamed file’s original path', () => {
    expect(groupChangedFiles(entries, 'src/moved').flatMap((g) => g.entries.map((e) => e.path))).toEqual(['lib/moved.ts']);
    expect(groupChangedFiles(entries, 'nothing-matches')).toEqual([]);
  });

  it('revert is offered only where it is safe, with a reason otherwise', () => {
    expect(revertAvailability(entry('a.ts', 'modified'))).toEqual({ ok: true });
    expect(revertAvailability(entry('a.ts', 'modified', { revertedAt: 1 }))).toMatchObject({ ok: false, message: 'Already reverted.' });
    expect(revertAvailability(entry('.env', 'modified', { final: { ...snap(true, 'hidden'), hiddenReason: 'secret' } })).ok).toBe(false);
    expect(revertAvailability(entry('a.ts', 'unchanged')).ok).toBe(false);
  });
});

describe('syntax colorizer', () => {
  it('picks the language from the extension', () => {
    expect(['a.ts', 'b.jsx', 'c.json', 'd.css', 'e.html', 'f.py', 'g.md'].map(languageForPath)).toEqual(['ts', 'ts', 'json', 'css', 'html', 'python', 'plain']);
  });

  it('TypeScript: keywords, strings, comments, numbers; block comments across lines', () => {
    const [line] = colorLines(['const x = "hi"; // note'], 'ts');
    expect(line.map((t) => t.kind)).toEqual(expect.arrayContaining(['keyword', 'string', 'comment']));
    const lines = colorLines(['/* start', 'still comment', 'end */ let y = 2;'], 'ts');
    expect(lines[1]).toEqual([{ text: 'still comment', kind: 'comment' }]);
    expect(lines[2].find((t) => t.text === 'let')?.kind).toBe('keyword');
    expect(lines[2].find((t) => t.text === '2')?.kind).toBe('number');
  });

  it('JSON keys, CSS properties, HTML tags and attributes, Python strings and comments', () => {
    expect(colorLine('  "name": "pawos",', 'json').tokens.find((t) => t.text === '"name"')?.kind).toBe('attr');
    expect(colorLine('  color: #fff;', 'css').tokens[1]).toEqual({ text: 'color', kind: 'attr' });
    const html = colorLine('<a href="/x">link</a>', 'html').tokens;
    expect(html.find((t) => t.text === '<a')?.kind).toBe('tag');
    expect(html.find((t) => t.text === 'href')?.kind).toBe('attr');
    const py = colorLines(['def f():', '    """doc', '    more"""  # c'], 'python');
    expect(py[0][0]).toEqual({ text: 'def', kind: 'keyword' });
    expect(py[1].some((t) => t.kind === 'string')).toBe(true);
    expect(py[2].at(-1)).toEqual({ text: '# c', kind: 'comment' });
  });

  it('unknown languages are plain text', () => {
    expect(colorLine('anything goes', 'plain').tokens).toEqual([{ text: 'anything goes', kind: 'plain' }]);
  });
});

describe('the Changes view', () => {
  const task: TaskCenterEntry = {
    executionId: 'exec-1',
    goal: 'Enable the feature',
    status: 'running',
    sessionId: 'chat-A',
    projectFolder: 'C:/proj',
    taskRecordId: null,
    startedAt: 1,
    endedAt: null,
    elapsedMs: 1,
    lastActivityAt: 1,
    currentOperation: null,
    changes: null,
    tests: null,
    problem: null,
    health: null,
    isActive: true,
    changeHistory: 'recorded',
  };
  const summary: CodeChangeSummary = {
    executionId: 'exec-1',
    accountId: null,
    projectRoot: 'C:/proj',
    createdAt: 1,
    updatedAt: 1,
    seq: 2,
    entries: [entry('src/config.ts', 'modified', { added: 1, removed: 1 }), entry('src/feature.ts', 'created', { added: 3, removed: 0 })],
    untrackedCommandCount: 1,
    totals: { files: 2, added: 4, removed: 1, created: 1, modified: 1, deleted: 0, renamed: 0 },
  };
  const render = (summaries: Map<string, CodeChangeSummary>, t: TaskCenterEntry = task) =>
    renderToStaticMarkup(
      React.createElement(ChangesView, { projectFolder: 'C:/proj', tasks: [t], summaries, selectedExecutionId: null, onSelectExecution: () => {}, onOpenFile: () => {} })
    );

  it('M1: Revert is disabled (with the reason) while the task is running or cancelling, enabled once it finished', () => {
    const running = render(new Map([['exec-1', summary]]));
    expect(running).toMatch(/<button[^>]*disabled=""[^>]*title="Revert becomes available once this task has finished/);
    const cancelling = render(new Map([['exec-1', summary]]), { ...task, status: 'cancelling' });
    expect(cancelling).toMatch(/title="Revert becomes available once this task has finished/);
    const finished = render(new Map([['exec-1', summary]]), { ...task, status: 'completed', isActive: false });
    expect(finished).toMatch(/<button type="button"[^>]*title="Put this file back as it was before this task"[^>]*>Revert file/);
    expect(finished).not.toMatch(/<button[^>]*disabled=""[^>]*>Revert file/);
  });

  it('empty project, but earlier tasks changed files without a history: says so, distinct from "nothing changed"', () => {
    const html = render(new Map(), { ...task, status: 'completed', changeHistory: 'unavailable' });
    expect(html).toContain('No file changes recorded for this project yet');
    expect(html).toContain('1 earlier task in this project changed files, but their file history isn’t available');
  });

  it('shows the task’s changed files grouped, with counts, live state and the untracked-commands note', () => {
    const html = render(new Map([['exec-1', summary]]));
    expect(html).toContain('Enable the feature');
    expect(html).toContain('config.ts');
    expect(html).toContain('feature.ts');
    expect(html).toMatch(/Created/);
    expect(html).toMatch(/Modified/);
    expect(html).toContain('updating live');
    expect(html).toContain('commands also ran');
    expect(html).toContain('aria-current="true"');
  });

  it('empty state when nothing was recorded for this project', () => {
    expect(render(new Map())).toContain('No file changes recorded for this project yet');
  });
});

describe('project matching (exact, never by a shared ancestor)', () => {
  it('by the task’s own project folder', () => {
    expect(taskInProject({ projectFolder: 'C:/Users/me/proj' }, 'C:/Users/me', 'C:/Users/me/proj')).toBe(true);
    expect(taskInProject({ projectFolder: 'C:/Users/me/other' }, 'C:/Users/me', 'C:/Users/me/proj')).toBe(false);
  });
  it('a task without a folder only by a history rooted exactly at the project', () => {
    expect(taskInProject({ projectFolder: null }, 'C:\\Users\\me\\proj', 'C:/Users/me/proj')).toBe(true);
    expect(taskInProject({ projectFolder: null }, 'C:/Users/me', 'C:/Users/me/proj')).toBe(false);
  });
});

describe('M4: only the shown rows are colored; diff text headers', () => {
  it('lines past the color limit stay plain until shown', () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({ kind: 'add' as const, text: `const x${i} = 1;`, oldLine: null, newLine: i + 1 }));
    const rows = buildDiffRows(diffOf([{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 6, lines }]), 'ts', new Set(), 2);
    const tokenRows = rows.filter((r) => r.kind === 'line').map((r) => (r.kind === 'line' ? r.tokens : []));
    expect(tokenRows[0].some((t) => t.kind === 'keyword')).toBe(true);
    expect(tokenRows[1].some((t) => t.kind === 'keyword')).toBe(true);
    expect(tokenRows[2]).toEqual([{ text: 'const x2 = 1;', kind: 'plain' }]);
  });
  it('a new file’s copied diff uses the unified-diff empty-range header', () => {
    const text = toUnifiedDiff(diffOf([{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: 'add', text: 'hello', oldLine: null, newLine: 1 }] }]));
    expect(text).toContain('@@ -0,0 +1,1 @@');
  });
});
