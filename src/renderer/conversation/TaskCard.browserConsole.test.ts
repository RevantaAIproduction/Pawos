import { describe, expect, it } from 'vitest';
import { getLatestDevBrowserConsole } from './TaskCard';
import type { ConversationTaskAction, ConversationTaskRecord } from './ConversationTypes';
import type { DevBrowserConsoleEntry } from '../../shared/actions/DevBrowserTypes';

function makeAction(type: string, data?: unknown): ConversationTaskAction {
  return {
    id: `a-${type}`,
    type,
    request: { type } as ConversationTaskAction['request'],
    result: data !== undefined ? ({ ok: true, data } as ConversationTaskAction['result']) : undefined,
    startedAt: 0,
    endedAt: 1,
    inProgressText: '',
  };
}

function makeTask(actions: ConversationTaskAction[]): ConversationTaskRecord {
  return { id: 't1', goal: 'test', status: 'completed', startedAt: 0, endedAt: 1, actions };
}

const entry: DevBrowserConsoleEntry = { level: 'error', text: 'Uncaught TypeError', timestamp: 0 };

describe('getLatestDevBrowserConsole', () => {
  // Regression: System Integration Audit (2026-08-01) found readBrowserConsole (Browser Runtime)
  // returns { entries }, while devBrowserPreview (DevBrowserManager) returns { consoleEntries } —
  // this helper must recognize both so the Coding Canvas browserConsole region isn't silently
  // empty for a task that only ever called readBrowserConsole.
  it('recognizes DevBrowserPreviewPlugin\'s consoleEntries shape', () => {
    expect(getLatestDevBrowserConsole(makeTask([makeAction('devBrowserPreview', { consoleEntries: [entry] })]))).toEqual([entry]);
  });

  it('recognizes ReadBrowserConsolePlugin\'s entries shape', () => {
    expect(getLatestDevBrowserConsole(makeTask([makeAction('readBrowserConsole', { entries: [entry] })]))).toEqual([entry]);
  });

  it('returns the most recent shape when both kinds of actions occurred', () => {
    const older = { ...entry, text: 'older' };
    const newer = { ...entry, text: 'newer' };
    const task = makeTask([makeAction('devBrowserPreview', { consoleEntries: [older] }), makeAction('readBrowserConsole', { entries: [newer] })]);
    expect(getLatestDevBrowserConsole(task)).toEqual([newer]);
  });

  it('returns undefined when no action produced console entries', () => {
    expect(getLatestDevBrowserConsole(makeTask([makeAction('writeFile')]))).toBeUndefined();
  });
});
