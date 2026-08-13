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
