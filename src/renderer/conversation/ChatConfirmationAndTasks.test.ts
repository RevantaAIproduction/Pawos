import { describe, expect, it } from 'vitest';
import { confirmationPrompt, isAllowReply, isDenyReply } from './confirmationPrompt';
import { buildTaskPanelEntries, countRunning } from './tasksPanelModel';
import { runningTaskLabel } from './extensions/components/TaskProgressExtensionCard';
import type { ConversationTaskRecord } from './ConversationTypes';

describe('Confirmation is a chat message, answered with "allow"/"deny"', () => {
  it('says exactly what PawOS is about to do', () => {
    expect(confirmationPrompt({ type: 'runCommand', command: 'npm install', cwd: 'C:\\work\\app' })).toBe(
      'I need permission to run `npm install` in C:\\work\\app.\nReply "allow" and I\'ll proceed, or "deny" to skip.',
    );
    expect(confirmationPrompt({ type: 'deletePath', path: 'C:\\tmp\\old' })).toContain('delete C:\\tmp\\old');
    expect(confirmationPrompt({ type: 'readFile', path: 'C:\\docs\\Resume.docx' })).toMatch(/^I need permission to read C:\\docs\\Resume\.docx\./);
    expect(confirmationPrompt({ type: 'searchFiles', rootPath: 'C:\\docs', query: 'resume' })).toContain('I need permission to search C:\\docs for "resume"');
    expect(confirmationPrompt({ type: 'gitCommit', cwd: 'C:\\r', message: 'fix' })).toContain('commit your changes in C:\\r with the message "fix"');
  });

  it.each(['allow', 'Allow', ' yes', 'ok go ahead'])('"%s" allows', (reply) => expect(isAllowReply(reply)).toBe(true));
  it.each(['deny', 'no', 'skip it', 'cancel'])('"%s" denies', (reply) => {
    expect(isDenyReply(reply)).toBe(true);
    expect(isAllowReply(reply)).toBe(false);
  });
});

const task = (over: Partial<ConversationTaskRecord>): ConversationTaskRecord => ({
  id: 't', goal: 'check node version', status: 'running', startedAt: 1, endedAt: null, actions: [], ...over,
});

describe('Tasks panel', () => {
  it('shows the folder + command and its output like a terminal; newest first; removed ones hidden', () => {
    const entries = buildTaskPanelEntries(
      [
        task({
          id: 'a', status: 'completed', endedAt: 2,
          actions: [{ id: 's1', type: 'runCommand', request: { type: 'runCommand', command: 'node -v', cwd: 'C:\\work' }, result: { ok: true, data: { output: 'v22.3.0' } }, startedAt: 1, endedAt: 2, inProgressText: 'Checking…', doneText: 'Node is installed.' }],
        }),
        task({ id: 'b', actions: [{ id: 's2', type: 'runCommand', request: { type: 'runCommand', command: 'npm test', cwd: 'C:\\work' }, startedAt: 3, endedAt: null, inProgressText: 'Running tests…' }] }),
        task({ id: 'gone', status: 'completed' }),
      ],
      new Set(['gone']),
    );
    expect(entries.map((e) => [e.id, e.status])).toEqual([['b', 'running'], ['a', 'done']]);
    expect(entries[1].steps[0]).toMatchObject({ path: 'C:\\work', commandLine: 'node -v', output: 'v22.3.0', status: 'done' });
    expect(entries[0].steps[0]).toMatchObject({ commandLine: 'npm test', status: 'running', output: 'running…' });
    expect(countRunning(entries)).toBe(1);
  });

  it('a task waiting on "allow" says so', () => {
    const [entry] = buildTaskPanelEntries(
      [task({ status: 'stopped', actions: [{ id: 's', type: 'deletePath', request: { type: 'deletePath', path: 'C:\\x' }, result: { ok: false, reason: 'requires-confirmation' }, startedAt: 1, endedAt: 2, inProgressText: '' }] })],
      new Set(),
    );
    expect(entry.status).toBe('waiting');
  });
});

describe('Inline task card shows only the running count', () => {
  const step = (status: 'pending' | 'completed') => ({ id: status + Math.random(), type: 'runCommand', inProgressText: '', status, startedAt: 1 });
  it.each([
    [[step('pending')], '1 running task'],
    [[step('pending'), step('pending'), step('completed')], '2 running tasks'],
    [[], '1 running task'],
  ])('%#', (actions, label) => {
    expect(runningTaskLabel({ state: 'running', actions: actions as never })).toBe(label);
  });
});
