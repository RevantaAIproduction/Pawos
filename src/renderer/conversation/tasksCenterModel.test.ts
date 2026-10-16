import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CodeChangeSummary } from '../../shared/actions/CodeChangeTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { INACTIVITY_WARNING_MS, buildTaskCenterEntries, countByFilter, healthOf, matchesFilter, statusOf } from './tasksCenterModel';
import { TasksPanel } from './TasksPanel';

/** The Tasks Center model: canonical status per execution, filters, and a health policy built only on recorded timestamps. */

const NOW = 10_000_000;
const record = (overrides: Partial<ExecutionRecord>): ExecutionRecord => ({
  id: 'exec-1',
  goal: 'Fix the login form',
  status: 'in_progress',
  startedAt: NOW - 60_000,
  applicationsUsed: [],
  aiWorkersUsed: [],
  commandsExecuted: [],
  filesCreated: [],
  filesModified: [],
  verificationResults: [],
  recoveryAttempts: 0,
  timeline: [],
  summary: '',
  lastActivityAt: NOW - 1_000,
  ...overrides,
});

describe('status', () => {
  it('maps every recorded status to exactly one Tasks Center status', () => {
    expect(statusOf(record({ status: 'in_progress' }))).toBe('running');
    expect(statusOf(record({ status: 'awaiting_approval' }))).toBe('waiting');
    expect(statusOf(record({ status: 'cancelling' }))).toBe('cancelling');
    expect(statusOf(record({ status: 'completed' }))).toBe('completed');
    expect(statusOf(record({ status: 'failed' }))).toBe('failed');
    expect(statusOf(record({ status: 'cancelled' }))).toBe('cancelled');
    expect(statusOf(record({ status: 'interrupted' }))).toBe('interrupted');
    expect(statusOf(record({ status: 'abandoned' }))).toBe('stopped');
  });

  it('one row per execution — a duplicate record never shows twice', () => {
    const entries = buildTaskCenterEntries([record({ id: 'a' }), record({ id: 'a' }), record({ id: 'b' })], new Map(), null, NOW);
    expect(entries.map((e) => e.executionId)).toEqual(['a', 'b']);
  });

  it('filters: each task appears in its own view, and in All', () => {
    const entries = buildTaskCenterEntries(
      [
        record({ id: 'run', status: 'in_progress' }),
        record({ id: 'cancelling', status: 'cancelling' }),
        record({ id: 'wait', status: 'awaiting_approval' }),
        record({ id: 'done', status: 'completed', completedAt: NOW }),
        record({ id: 'fail', status: 'failed' }),
        record({ id: 'cancel', status: 'cancelled' }),
        record({ id: 'gone', status: 'interrupted' }),
      ],
      new Map(),
      null,
      NOW
    );
    expect(countByFilter(entries)).toEqual({ all: 7, running: 2, waiting: 1, completed: 1, failed: 2, interrupted: 1 });
    expect(entries.filter((e) => matchesFilter(e, 'failed')).map((e) => e.executionId)).toEqual(['fail', 'cancel']);
  });

  it('only this window’s running (or waiting) task can be cancelled', () => {
    const [running, other] = buildTaskCenterEntries([record({ id: 'mine' }), record({ id: 'theirs', startedAt: NOW - 90_000 })], new Map(), 'mine', NOW);
    expect(running).toMatchObject({ executionId: 'mine', isActive: true });
    expect(other).toMatchObject({ executionId: 'theirs', isActive: false });
    const [done] = buildTaskCenterEntries([record({ id: 'mine', status: 'completed' })], new Map(), 'mine', NOW);
    expect(done.isActive).toBe(false);
  });

  it('changes, tests and problems come from the record and its ledger', () => {
    const summary = {
      executionId: 'exec-1',
      accountId: null,
      projectRoot: 'C:/p',
      createdAt: 1,
      updatedAt: 1,
      seq: 3,
      entries: [],
      untrackedCommandCount: 1,
      totals: { files: 2, added: 10, removed: 4, created: 1, modified: 1, deleted: 0, renamed: 0 },
    } satisfies CodeChangeSummary;
    const [entry] = buildTaskCenterEntries(
      [
        record({
          status: 'failed',
          stoppedReason: undefined,
          timeline: [{ type: 'runCommand', ok: false, label: 'npm test failed', startedAt: 1, endedAt: 2 }],
          verificationEvidence: [
            { type: 'TEST', action: 'npm test', status: 'failed', timestamp: 2, summary: 'Test command failed.', failureReason: '2 failing' },
            { type: 'BUILD', action: 'npm run build', status: 'passed', timestamp: 3, summary: 'Build passed.' },
          ],
        }),
      ],
      new Map([['exec-1', summary]]),
      null,
      NOW
    );
    expect(entry.changes).toMatchObject({ files: 2, added: 10, removed: 4, untrackedCommands: 1 });
    expect(entry.tests).toEqual({ passed: 0, failed: 1, skipped: 0, lastSummary: '2 failing' });
    expect(entry.problem).toBe('npm test failed');
  });
});

describe('health — real timestamps only, never converted to failed', () => {
  it('a command inside its own time limit is running long, not stalled', () => {
    const h = healthOf(record({ currentOperation: { actionType: 'runCommand', label: 'Running npm test…', startedAt: NOW - 40_000 } }), NOW);
    expect(h?.state).toBe('long_running');
  });

  it('a build well inside its 5-minute limit is not stalled even with no new output', () => {
    const h = healthOf(record({ lastActivityAt: NOW - 4 * 60_000, currentOperation: { actionType: 'buildProject', label: 'Building…', startedAt: NOW - 4 * 60_000 } }), NOW);
    expect(h?.state).toBe('long_running');
  });

  it('past its limit plus grace with no result: stalled (a warning), status still running', () => {
    const r = record({ currentOperation: { actionType: 'runCommand', label: 'Running npm test…', startedAt: NOW - 120_000 } });
    expect(healthOf(r, NOW)?.state).toBe('stalled');
    expect(buildTaskCenterEntries([r], new Map(), null, NOW)[0].status).toBe('running');
  });

  it('no step running and no activity for a while: stalled warning; recent activity: nothing to report', () => {
    expect(healthOf(record({ lastActivityAt: NOW - INACTIVITY_WARNING_MS - 1 }), NOW)?.state).toBe('stalled');
    expect(healthOf(record({ lastActivityAt: NOW - 1_000 }), NOW)).toBeNull();
  });

  it('cancelling for over a minute says what it is waiting for', () => {
    const h = healthOf(record({ status: 'cancelling', cancellation: { requestedAt: NOW - 90_000, stillRunningAction: 'writeFile' } }), NOW);
    expect(h).toMatchObject({ state: 'stalled' });
    expect(h?.message).toMatch(/writeFile/);
  });

  it('finished tasks have no health warning', () => {
    expect(healthOf(record({ status: 'completed', lastActivityAt: 0 }), NOW)).toBeNull();
  });
});

describe('the Tasks panel', () => {
  const entries = buildTaskCenterEntries(
    [record({ id: 'mine', goal: 'Run the tests', sessionId: 'chat-A' }), record({ id: 'old', goal: 'Old task', status: 'completed', sessionId: 'chat-B', completedAt: NOW - 3_600_000, startedAt: NOW - 3_700_000 })],
    new Map(),
    'mine',
    NOW
  );
  const html = renderToStaticMarkup(
    React.createElement(TasksPanel, { tasks: entries, now: NOW, steps: [], currentSessionId: 'chat-A', onCancelActive: () => {}, onOpenChat: () => {} })
  );

  it('lists tasks from every chat with their status, chat label and a cancel control only on the active one', () => {
    expect(html).toContain('Run the tests');
    expect(html).toContain('Old task');
    expect(html).toContain('This chat');
    expect(html).toContain('Another chat');
    expect(html.match(/aria-label="Cancel /g)).toHaveLength(1);
    expect(html).toContain('1 running');
  });

  it('offers filters with counts', () => {
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/Completed<span[^>]*>1<\/span>/);
  });

  it('empty state', () => {
    const empty = renderToStaticMarkup(React.createElement(TasksPanel, { tasks: [], now: NOW, steps: [], currentSessionId: null, onCancelActive: () => {} }));
    expect(empty).toContain('show up here, from every chat');
  });
});

describe('file history state', () => {
  it('recorded, unavailable (changed files but no history), or none', () => {
    const summary = { executionId: 'with', accountId: 'a', projectRoot: 'C:/p', createdAt: 1, updatedAt: 1, seq: 1, entries: [], untrackedCommandCount: 0, totals: { files: 0, added: 0, removed: 0, created: 0, modified: 0, deleted: 0, renamed: 0 } } satisfies CodeChangeSummary;
    const entries = buildTaskCenterEntries(
      [
        record({ id: 'with', status: 'completed' }),
        record({ id: 'old', status: 'completed', fileEvidence: [{ operation: 'MODIFY', path: 'C:/p/a.ts', timestamp: 1, result: 'completed' }] }),
        record({ id: 'none', status: 'completed' }),
      ],
      new Map([['with', summary]]),
      null,
      NOW
    );
    const byId = Object.fromEntries(entries.map((e) => [e.executionId, e.changeHistory]));
    expect(byId).toEqual({ with: 'recorded', old: 'unavailable', none: 'none' });
  });
});
