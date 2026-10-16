import { describe, expect, it } from 'vitest';
import type { ConversationTaskRecord } from './ConversationTypes';
import { buildTaskPanelEntries, countRunning } from './tasksPanelModel';

/** The Tasks panel shows Cancelling and Cancelled as themselves — never as Done or as a step still running. */

const task = (status: ConversationTaskRecord['status']): ConversationTaskRecord => ({
  id: `t-${status}`,
  goal: 'Run the tests',
  status,
  startedAt: 1,
  endedAt: 2,
  actions: [
    {
      id: 'a1',
      type: 'runCommand',
      request: { type: 'runCommand', command: 'npm test', cwd: 'C:/p' } as ConversationTaskRecord['actions'][number]['request'],
      startedAt: 1,
      endedAt: null,
      inProgressText: 'Running npm test…',
    },
  ],
});

describe('cancelled tasks in the Tasks panel', () => {
  it('Cancelling: the open step shows as stopping, and the task is not counted as running', () => {
    const [entry] = buildTaskPanelEntries([task('cancelling')], new Set());
    expect(entry.status).toBe('cancelling');
    expect(entry.steps[0]).toMatchObject({ status: 'stopped', output: 'Stopping…' });
    expect(countRunning([entry])).toBe(0);
  });

  it('Cancelled: the open step shows as stopped by the cancel', () => {
    const [entry] = buildTaskPanelEntries([task('cancelled')], new Set());
    expect(entry.status).toBe('cancelled');
    expect(entry.steps[0]).toMatchObject({ status: 'stopped', output: 'Stopped by cancel.' });
  });

  it('a running task is unchanged', () => {
    const [entry] = buildTaskPanelEntries([task('running')], new Set());
    expect(entry.status).toBe('running');
    expect(entry.steps[0]).toMatchObject({ status: 'running', output: 'running…' });
  });
});
