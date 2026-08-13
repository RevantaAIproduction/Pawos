import { describe, expect, it } from 'vitest';
import { buildWorkRecord, redactSecretText } from './WorkRecord';
import type { ExecutionRecord } from './ExecutionRecordTypes';

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: 'work-1',
    goal: 'Build a SaaS dashboard.',
    status: 'completed',
    startedAt: 1000,
    completedAt: 4000,
    durationMs: 3000,
    applicationsUsed: [],
    aiWorkersUsed: [],
    commandsExecuted: [],
    filesCreated: [],
    filesModified: [],
    verificationResults: [],
    recoveryAttempts: 0,
    timeline: [],
    summary: 'Done.',
    ...overrides,
  };
}

describe('WorkRecord projection', () => {
  it('creates a structured work record from an execution record', () => {
    const work = buildWorkRecord(record());

    expect(work.identity.workId).toBe('work-1');
    expect(work.request.normalizedGoal).toBe('Build a SaaS dashboard.');
    expect(work.completion.status).toBe('COMPLETED');
  });

  it('captures live execution, command, file, and verification evidence', () => {
    const work = buildWorkRecord(record({
      commandsExecuted: ['npm run build'],
      filesCreated: ['src/App.tsx'],
      filesModified: ['src/pages/Dashboard.tsx'],
      verificationResults: [{ description: 'Build passed', ok: true }],
      timeline: [{ type: 'runCommand', ok: true, label: 'npm run build', startedAt: 2000, endedAt: 3500 }],
    }));

    expect(work.timeline[0]).toMatchObject({ label: 'npm run build', status: 'completed' });
    expect(work.commands.items[0]).toMatchObject({ command: 'npm run build' });
    expect(work.files.items.map((item) => item.path)).toEqual(['src/App.tsx', 'src/pages/Dashboard.tsx']);
    expect(work.verification.items[0]).toMatchObject({ summary: 'Passed: Build passed' });
  });

  it('preserves detailed command, file, diff, and verification evidence', () => {
    const work = buildWorkRecord(record({
      commandEvidence: [{
        command: 'npm run build API_KEY=secret',
        safeCommand: 'npm run build API_KEY=<redacted>',
        cwd: 'C:/project',
        startedAt: 2000,
        completedAt: 3500,
        durationMs: 1500,
        exitCode: 0,
        status: 'completed',
        output: 'Build passed',
      }],
      fileEvidence: [{ operation: 'CREATE', path: 'C:/project/src/App.tsx', timestamp: 2100, result: 'completed' }],
      diffEvidence: [{ timestamp: 2200, filesChanged: [{ path: 'src/App.tsx', added: 10, deleted: 0 }], totalAdded: 10, totalDeleted: 0, summary: '1 file changed, +10/-0 lines.' }],
      verificationEvidence: [{ type: 'BUILD', action: 'npm run build', status: 'passed', timestamp: 3500, summary: 'Build passed.' }],
    }));

    expect(work.commands.items[0]).toMatchObject({ command: 'npm run build API_KEY=<redacted>', cwd: 'C:/project', exitCode: 0 });
    expect(work.files.items[0]).toMatchObject({ change: 'created', path: 'C:/project/src/App.tsx', result: 'completed' });
    expect(work.diffs.items[0]?.summary).toBe('1 file changed, +10/-0 lines.');
    expect(work.verification.items[0]).toMatchObject({ type: 'BUILD', status: 'passed', summary: 'Build passed.' });
  });

  it('records stopped reason and next action', () => {
    const work = buildWorkRecord(record({
      status: 'abandoned',
      summary: 'Coding Runtime requires a paid entitlement.',
      stoppedReason: 'Coding Runtime requires a paid entitlement.',
      nextAction: 'Upgrade to Paw Pro.',
    }));

    expect(work.completion).toEqual({
      status: 'STOPPED',
      reason: 'Coding Runtime requires a paid entitlement.',
      nextAction: 'Upgrade to Paw Pro.',
    });
  });

  it('redacts secret-looking command values', () => {
    expect(redactSecretText('deploy API_KEY=abc DATABASE_URL=postgres://secret normal=value')).toBe(
      'deploy API_KEY=<redacted> DATABASE_URL=<redacted> normal=value'
    );
  });

  it('handles empty and missing evidence without inventing detail', () => {
    const work = buildWorkRecord(record({ goal: '', summary: '', status: 'in_progress' }));

    expect(work.plan.status).toBe('empty');
    expect(work.commands.status).toBe('empty');
    expect(work.files.status).toBe('empty');
    expect(work.completion.status).toBe('INCOMPLETE');
  });

  it('carries organization context when present', () => {
    const work = buildWorkRecord(record({ organizationId: 'org-1', runtime: 'coding' }));

    expect(work.identity.organizationId).toBe('org-1');
    expect(work.identity.runtime).toBe('coding');
  });

  it('omits the blocked panel for completed work', () => {
    const work = buildWorkRecord(record({ status: 'completed' }));
    expect(work.blocked).toBeUndefined();
  });

  it('omits the blocked panel for in-progress work', () => {
    const work = buildWorkRecord(record({ status: 'in_progress' }));
    expect(work.blocked).toBeUndefined();
  });

  it('reports real completed steps and honest not-executed areas for stopped work with zero evidence', () => {
    const work = buildWorkRecord(record({
      status: 'abandoned',
      stoppedReason: 'Coding execution requires Paw Pro.',
      nextAction: 'Upgrade to Paw Pro.',
      timeline: [
        { type: 'analyzeProject', ok: true, label: 'Requirements understood', startedAt: 1000, endedAt: 1200 },
        { type: 'proposeCodeEditPlan', ok: true, label: 'Project plan prepared', startedAt: 1200, endedAt: 1500 },
      ],
    }));

    expect(work.completion.status).toBe('STOPPED');
    expect(work.blocked).toBeDefined();
    expect(work.blocked?.reason).toBe('Coding execution requires Paw Pro.');
    expect(work.blocked?.nextAction).toBe('Upgrade to Paw Pro.');
    expect(work.blocked?.completedSteps).toEqual(['Requirements understood', 'Project plan prepared']);
    // Zero command/file/build/test evidence exists anywhere on the record, so every category is
    // honestly 'not_executed' -- never 'blocked', since no blocked-evidence entry exists.
    expect(work.blocked?.incompleteAreas).toEqual([
      { label: 'Run commands', status: 'not_executed' },
      { label: 'Create or modify files', status: 'not_executed' },
      { label: 'Run build', status: 'not_executed' },
      { label: 'Run tests', status: 'not_executed' },
    ]);
  });

  it('marks a category as blocked only when real blocked evidence exists for it', () => {
    const work = buildWorkRecord(record({
      status: 'failed',
      stoppedReason: 'Command execution was denied.',
      commandEvidence: [{
        command: 'npm run build',
        safeCommand: 'npm run build',
        startedAt: 2000,
        completedAt: 2000,
        durationMs: 0,
        status: 'blocked',
        output: 'Blocked by policy',
      }],
    }));

    const commandsArea = work.blocked?.incompleteAreas.find((item) => item.label === 'Run commands');
    expect(commandsArea).toEqual({ label: 'Run commands', status: 'blocked' });
  });

  it('never claims a category is incomplete once real attempted evidence exists for it', () => {
    const work = buildWorkRecord(record({
      status: 'failed',
      stoppedReason: 'Build failed.',
      verificationEvidence: [
        { type: 'BUILD', action: 'npm run build', status: 'failed', timestamp: 3000, summary: 'Build failed.' },
      ],
    }));

    const buildArea = work.blocked?.incompleteAreas.find((item) => item.label === 'Run build');
    expect(buildArea).toBeUndefined();
    // Tests were never attempted at all, so that category honestly remains.
    const testArea = work.blocked?.incompleteAreas.find((item) => item.label === 'Run tests');
    expect(testArea).toEqual({ label: 'Run tests', status: 'not_executed' });
  });
});
