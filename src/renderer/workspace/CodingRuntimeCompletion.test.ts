import { describe, expect, it } from 'vitest';
import type { ConversationTaskRecord } from '../conversation/ConversationTypes';
import { getCodingRuntimeCommandSummaries, summarizeCodingRuntimeTask } from './CodingRuntimeCompletion';

const now = 1_000;

function task(actions: ConversationTaskRecord['actions'], goal = 'Fix this error in my project.'): ConversationTaskRecord {
  return { id: 'task-1', goal, status: 'completed', startedAt: now, endedAt: now + 2_000, actions };
}

describe('CodingRuntimeCompletion', () => {
  it('summarizes command status, output, cwd, duration, and failed exit evidence from existing action records', () => {
    const summary = getCodingRuntimeCommandSummaries(
      task([
        {
          id: 'a1',
          type: 'runCommand',
          request: { type: 'runCommand', command: 'npm run build', cwd: 'C:/project' },
          startedAt: now,
          endedAt: now + 1500,
          inProgressText: 'Running build',
          result: { ok: false, reason: 'failed', message: 'Build failed', data: { output: 'TypeScript error', exitCode: 1 } },
        },
      ])
    );

    expect(summary).toEqual([
      {
        id: 'a1',
        command: 'npm run build',
        cwd: 'C:/project',
        status: 'failed',
        exitCode: 1,
        durationMs: 1500,
        output: 'TypeScript error',
      },
    ]);
  });

  it('marks execution incomplete when a visual verification result reports issues', () => {
    const summary = summarizeCodingRuntimeTask(
      task([
        {
          id: 'write',
          type: 'writeFile',
          request: { type: 'writeFile', path: 'C:/project/src/App.tsx', content: 'export default function App(){}' },
          startedAt: now,
          endedAt: now + 20,
          inProgressText: 'Writing file',
          result: { ok: true, data: { overwritten: false } },
        },
        {
          id: 'visual',
          type: 'verifyRenderedUi',
          request: { type: 'verifyRenderedUi', sessionId: 'dev-1' },
          startedAt: now + 30,
          endedAt: now + 60,
          inProgressText: 'Checking UI',
          result: { ok: true, data: { ok: false, issues: ['Hero image failed to load'], base64Png: 'png' } },
        },
      ])
    );

    expect(summary.classification).toBe('EXECUTE');
    expect(summary.createdFiles).toEqual(['C:/project/src/App.tsx']);
    expect(summary.readiness).toEqual({
      status: 'incomplete',
      reason: 'Required verification has not passed.',
      evidence: ['Visual verification found issues.'],
    });
  });

  it('surfaces usage only when an existing action result emitted usage data', () => {
    const withoutUsage = summarizeCodingRuntimeTask(task([]));
    expect(withoutUsage.usage).toEqual({ source: 'not-emitted' });

    const withUsage = summarizeCodingRuntimeTask(
      task([
        {
          id: 'usage',
          type: 'runCommand',
          request: { type: 'runCommand', command: 'npm test', cwd: 'C:/project' },
          startedAt: now,
          endedAt: now + 40,
          inProgressText: 'Testing',
          result: { ok: true, data: { output: 'pass', usage: { taskUsedUnits: 12, sessionUsedUnits: 34, remainingUnits: 56 } } },
        },
      ])
    );

    expect(withUsage.usage).toEqual({ taskUsedUnits: 12, sessionUsedUnits: 34, remainingUnits: 56, source: 'action-result' });
  });

  it('keeps guidance and planning requests non-execution when no mutating action happened', () => {
    const summary = summarizeCodingRuntimeTask(task([], 'Give me the command to fix this.'));
    expect(summary.classification).toBe('GUIDANCE');
    expect(summary.readiness).toEqual({ status: 'completed', message: 'Verification passed.' });
  });

  it('does not mark an approved project-plan build complete when execution never starts', () => {
    const summary = summarizeCodingRuntimeTask(task([], 'Build Project from the approved PROJECT PLAN.'));
    expect(summary.classification).toBe('EXECUTE');
    expect(summary.readiness).toEqual({
      status: 'incomplete',
      reason: 'Required verification has not passed.',
      evidence: ['No file or command activity was recorded for this execution task.'],
    });
  });
});
