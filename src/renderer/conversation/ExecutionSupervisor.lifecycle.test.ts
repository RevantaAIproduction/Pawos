import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';
import { ExecutionSupervisor } from './ExecutionSupervisor';

/** Task identity, revisions, activity, stale results and the Cancelling → Cancelled lifecycle of a Work History record. */

function supervisor() {
  const saves: ExecutionRecord[] = [];
  const s = new ExecutionSupervisor((record) => saves.push(record));
  const last = (id?: string) => [...saves].reverse().find((r) => !id || r.id === id)!;
  return { s, saves, last };
}

const command = (executionId: string | undefined): ActionRequest => ({ type: 'runCommand', command: 'npm test', cwd: 'C:/p', executionId }) as ActionRequest;

describe('execution identity and revisions', () => {
  it('each request gets a stable id; every save carries a higher revision', () => {
    const { s, saves } = supervisor();
    s.begin('Fix the bug', { sessionId: 'chat-1', projectFolder: 'C:/p' });
    const id = s.currentExecutionId!;
    s.startAction(id, 'runCommand', 'Running npm test…');
    s.recordAction(command(id), { ok: true, data: { output: 'ok' } }, { label: 'Done.', startedAt: 1, endedAt: 2 });
    s.end('completed', 'Fixed.');
    expect(new Set(saves.map((r) => r.id))).toEqual(new Set([id]));
    const revisions = saves.map((r) => r.revision ?? 0);
    expect(revisions).toEqual([...revisions].sort((a, b) => a - b));
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(saves[0]).toMatchObject({ sessionId: 'chat-1', projectFolder: 'C:/p' });
    expect(s.currentExecutionId).toBeNull();
  });

  it('records the current operation while it runs and clears it when it ends', () => {
    const { s, last } = supervisor();
    s.begin('Run tests');
    const id = s.currentExecutionId!;
    s.startAction(id, 'runCommand', 'Running npm test…');
    expect(last().currentOperation).toMatchObject({ actionType: 'runCommand', label: 'Running npm test…' });
    s.recordAction(command(id), { ok: true }, { label: 'Done.', startedAt: 1, endedAt: 50 });
    expect(last().currentOperation).toBeNull();
    expect(last().lastActivityAt).toBe(50);
  });

  it('a chat id learned after the first turn is saved lands on the record (even after it ended)', () => {
    const { s, last } = supervisor();
    s.begin('New chat request');
    const id = s.currentExecutionId!;
    s.end('completed', 'ok');
    s.annotate(id, { sessionId: 'chat-new' });
    expect(last(id).sessionId).toBe('chat-new');
    expect(last(id).status).toBe('completed');
  });
});

describe('results from another execution', () => {
  it('a late result of an older execution never lands on the current one', () => {
    const { s, last } = supervisor();
    s.begin('First');
    const first = s.currentExecutionId!;
    s.end('interrupted', 'stopped');
    s.begin('Second');
    const second = s.currentExecutionId!;
    s.recordAction(command(first), { ok: true, data: { output: 'late' } }, { label: 'Done.', startedAt: 1, endedAt: 2 });
    expect(last(second).commandEvidence).toEqual([]);
    expect(last(second).timeline).toEqual([]);
  });
});

describe('cancellation', () => {
  const confirmed = { confirmed: true, hadRunningAction: true, runningActionType: 'runCommand', stopped: 1, nonCancellable: false, stillRunning: null };
  const unconfirmed = { confirmed: false, hadRunningAction: true, runningActionType: 'writeFile', stopped: 0, nonCancellable: true, stillRunning: { actionType: 'writeFile', startedAt: 1 } };

  it('Cancelling until the main process confirms, then Cancelled', () => {
    const { s, last } = supervisor();
    s.begin('Long build');
    const id = s.currentExecutionId!;
    expect(s.requestCancellation(id)).toBe(true);
    expect(last().status).toBe('cancelling');
    s.end('interrupted', 'cancelled');
    expect(last(id).status).toBe('cancelling');
    s.confirmCancellation(id, confirmed);
    expect(last(id).status).toBe('cancelled');
    expect(last(id).cancellation?.confirmedAt).toBeTypeOf('number');
  });

  it('confirmed before the turn ended: the end itself settles it as Cancelled', () => {
    const { s, last } = supervisor();
    s.begin('Quick');
    const id = s.currentExecutionId!;
    s.requestCancellation(id);
    s.confirmCancellation(id, { ...confirmed, hadRunningAction: false, runningActionType: null, stopped: 0 });
    expect(last(id).status).toBe('cancelling');
    s.end('interrupted', 'cancelled');
    expect(last(id).status).toBe('cancelled');
  });

  it('not confirmed: stays Cancelling and says what is still running — never reported as cancelled', () => {
    const { s, last } = supervisor();
    s.begin('Write files');
    const id = s.currentExecutionId!;
    s.requestCancellation(id);
    s.end('interrupted', 'cancelled');
    s.confirmCancellation(id, unconfirmed);
    expect(last(id).status).toBe('cancelling');
    expect(last(id).cancellation).toMatchObject({ nonCancellableAction: 'writeFile', stillRunningAction: 'writeFile' });
    expect(last(id).cancellation?.confirmedAt).toBeUndefined();
  });

  it('a finished task cannot be cancelled after the fact, and a second cancel is harmless', () => {
    const { s, last } = supervisor();
    s.begin('Done already');
    const id = s.currentExecutionId!;
    s.end('completed', 'ok');
    expect(s.requestCancellation(id)).toBe(false);
    expect(last(id).status).toBe('completed');

    s.begin('Twice');
    const twice = s.currentExecutionId!;
    expect(s.requestCancellation(twice)).toBe(true);
    expect(s.requestCancellation(twice)).toBe(true);
    expect(last(twice).status).toBe('cancelling');
  });
});
