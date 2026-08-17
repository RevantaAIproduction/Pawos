import { describe, expect, it } from 'vitest';
import { ExecutionSupervisor } from './ExecutionSupervisor';
import type { ExecutionRecord } from '../../shared/actions/ExecutionRecordTypes';

describe('ExecutionSupervisor evidence pipeline', () => {
  function capture(): { supervisor: ExecutionSupervisor; records: ExecutionRecord[] } {
    const records: ExecutionRecord[] = [];
    return { supervisor: new ExecutionSupervisor((record) => records.push(record)), records };
  }

  it('records real command evidence from action results', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Build project');

    supervisor.recordAction(
      { type: 'runCommand', command: 'npm run build API_KEY=secret', cwd: 'C:/project' },
      { ok: true, data: { command: 'npm run build API_KEY=secret', cwd: 'C:/project', output: 'built ok', exitCode: 0 } },
      { label: 'I ran npm run build.', startedAt: 100, endedAt: 250 }
    );

    const latest = records.at(-1)!;
    expect(latest.commandsExecuted).toEqual(['npm run build API_KEY=secret']);
    expect(latest.commandEvidence?.[0]).toMatchObject({
      safeCommand: 'npm run build API_KEY=<redacted>',
      cwd: 'C:/project',
      durationMs: 150,
      exitCode: 0,
      status: 'completed',
      output: 'built ok',
    });
  });

  it('records file evidence only from real file actions', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Create files');

    supervisor.recordAction(
      { type: 'writeFile', path: 'C:/project/src/App.tsx', content: 'export {};' },
      { ok: true, data: { overwritten: false } },
      { label: 'Created App.tsx.', startedAt: 100, endedAt: 120 }
    );

    expect(records.at(-1)?.fileEvidence?.[0]).toMatchObject({
      operation: 'CREATE',
      path: 'C:/project/src/App.tsx',
      result: 'completed',
    });
  });

  it('records validation, diff, and failed execution evidence', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Verify project');

    supervisor.recordAction(
      { type: 'gitDiffStat', cwd: 'C:/project' },
      { ok: true, data: { filesChanged: [{ path: 'src/App.tsx', added: 5, deleted: 1 }], totalAdded: 5, totalDeleted: 1 } },
      { label: 'Checked diff.', startedAt: 100, endedAt: 110 }
    );
    supervisor.recordAction(
      { type: 'runValidationPipeline', rootPath: 'C:/project' },
      {
        ok: false,
        reason: 'failed',
        message: 'Validation failed.',
        data: {
          syntax: { status: 'passed' },
          imports: { status: 'passed' },
          typeCheck: { status: 'failed', command: 'npm run typecheck', errorDetail: 'Type error' },
        },
      },
      { label: 'Validation failed.', startedAt: 200, endedAt: 400 }
    );
    supervisor.end('completed', 'Validation failed.');

    const latest = records.at(-1)!;
    expect(latest.status).toBe('failed');
    expect(latest.diffEvidence?.[0]?.summary).toBe('1 file changed, +5/-1 lines.');
    expect(latest.verificationEvidence?.map((entry) => entry.type)).toContain('TYPECHECK');
    expect(latest.verificationEvidence?.find((entry) => entry.type === 'TYPECHECK')).toMatchObject({
      status: 'failed',
      failureReason: 'Type error',
    });
  });

  it('persists stopped entitlement evidence without fabricating commands or files', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Build app');

    supervisor.recordAction(
      { type: 'writeFile', path: 'C:/project/src/App.tsx', content: 'export {};' },
      { ok: false, reason: 'entitlement-restricted', message: 'This action requires Paw Pro.' },
      { label: 'This action requires Paw Pro.', startedAt: 100, endedAt: 105 }
    );
    supervisor.end('completed', 'Stopped.');

    const latest = records.at(-1)!;
    expect(latest.status).toBe('abandoned');
    expect(latest.stoppedReason).toBe('This action requires Paw Pro.');
    expect(latest.commandsExecuted).toEqual([]);
    expect(latest.filesCreated).toEqual([]);
    expect(latest.fileEvidence?.[0]).toMatchObject({ result: 'blocked' });
  });
});

/**
 * Section 6 — Execution Evidence: "model said it worked" must never become "verified successfully."
 * end()'s status derivation is a pure function of what actually happened in the timeline (real
 * ok/failed action results) — never trusts the endedReason the reasoning loop supplies alone.
 * These tests exercise that derivation directly against ExecutionSupervisor.end(), the single
 * chokepoint every conversation turn's completion status passes through.
 */
describe('ExecutionSupervisor — evidence-based completion cannot be faked', () => {
  function capture(): { supervisor: ExecutionSupervisor; records: ExecutionRecord[] } {
    const records: ExecutionRecord[] = [];
    return { supervisor: new ExecutionSupervisor((record) => records.push(record)), records };
  }

  it('a real failed action forces status "failed" even when the model reports the turn as completed', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Fix the build');

    supervisor.recordAction(
      { type: 'runCommand', command: 'npm run build', cwd: 'C:/project' },
      { ok: false, reason: 'failed', message: 'Build failed: type error.' },
      { label: 'Build failed.', startedAt: 100, endedAt: 300 }
    );
    // The model's own final turn narration claims success — this must not be trusted.
    supervisor.end('completed', 'Build succeeded.');

    const latest = records.at(-1)!;
    expect(latest.status).toBe('failed');
    expect(latest.status).not.toBe('completed');
  });

  it('a genuinely all-successful run with endedReason completed is honestly reported completed', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Build project');

    supervisor.recordAction(
      { type: 'runCommand', command: 'npm run build', cwd: 'C:/project' },
      { ok: true, data: { output: 'built ok', exitCode: 0 } },
      { label: 'Build succeeded.', startedAt: 100, endedAt: 300 }
    );
    supervisor.end('completed', 'Build succeeded.');

    expect(records.at(-1)?.status).toBe('completed');
  });

  it('a blocked action cannot be overwritten back to completed by a later successful action', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Deploy the app');

    supervisor.recordAction(
      { type: 'runCommand', command: 'echo ok', cwd: 'C:/project' },
      { ok: false, reason: 'entitlement-restricted', message: 'Requires Paw Pro.' },
      { label: 'Requires Paw Pro.', startedAt: 100, endedAt: 105 }
    );
    // A later, unrelated action in the same turn succeeds — must never flip the outcome.
    supervisor.recordAction(
      { type: 'readFile', path: 'C:/project/README.md' },
      { ok: true, data: { content: 'readme' } },
      { label: 'Read the readme.', startedAt: 200, endedAt: 210 }
    );
    supervisor.end('completed', 'Done.');

    expect(records.at(-1)?.status).toBe('abandoned');
  });

  it('an interrupted turn is never reported completed, even with zero recorded failures', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Do something');

    supervisor.recordAction(
      { type: 'readFile', path: 'C:/project/README.md' },
      { ok: true, data: { content: 'readme' } },
      { label: 'Read the readme.', startedAt: 100, endedAt: 110 }
    );
    // Session ended (app quit / navigated away) mid-turn — no action ever failed, but the turn
    // never reached a real "done" narration either.
    supervisor.end('interrupted', 'Session ended.');

    const latest = records.at(-1)!;
    expect(latest.status).toBe('abandoned');
    expect(latest.status).not.toBe('completed');
  });

  it('calling end() a second time is a safe no-op — a completed turn cannot be double-charged by a duplicate completion signal', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Build project');
    supervisor.recordAction(
      { type: 'runCommand', command: 'npm run build', cwd: 'C:/project' },
      { ok: true, data: { output: 'built ok', exitCode: 0 } },
      { label: 'Build succeeded.', startedAt: 100, endedAt: 300 }
    );
    supervisor.end('completed', 'Build succeeded.');
    const countAfterFirstEnd = records.length;

    // A stray/duplicate call (e.g. a retried finalize) after the record was already closed.
    supervisor.end('completed', 'Build succeeded.');

    expect(records.length).toBe(countAfterFirstEnd);
  });

  it('an error-ended turn with no explicit blocked/failed action is honestly reported failed, never completed', () => {
    const { supervisor, records } = capture();
    supervisor.begin('Do something risky');
    supervisor.recordAction(
      { type: 'readFile', path: 'C:/project/README.md' },
      { ok: true, data: { content: 'readme' } },
      { label: 'Read the readme.', startedAt: 100, endedAt: 110 }
    );
    // A thrown exception in the reasoning loop itself, not tied to any one action's own result.
    supervisor.end('error', 'Unexpected error.');

    expect(records.at(-1)?.status).toBe('failed');
  });
});
