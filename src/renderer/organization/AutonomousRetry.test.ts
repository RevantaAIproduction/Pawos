import { describe, expect, it, vi } from 'vitest';
import { AUTONOMOUS_MAX_ATTEMPTS, orchestrateWithAutoRetry } from './AutonomousRetry';
import type { AutonomousOrchestrationResult } from './AutonomousOrchestrator';

function result(runId: string, kind: 'success' | 'failed' | 'blocked' | 'cancelled'): AutonomousOrchestrationResult {
  return {
    runId,
    outcome: { kind, reason: kind, evidence: { executionRecordId: null, commandsExecuted: 0, filesChanged: 0, checks: [] } },
    billingEventId: kind === 'success' ? `evt-${runId}` : null,
    externalUpdate: { label: 'External update', status: 'NOT_EXECUTED', detail: '' },
  } as AutonomousOrchestrationResult;
}

describe('Autonomous Work — automatic retry on failure', () => {
  it('a failed run is retried immediately as a fresh run and the completed attempt is the result', async () => {
    const outcomes = ['failed', 'success'] as const;
    let call = 0;
    let nextRun = 1;
    const orchestrate = vi.fn(async (runId: string) => result(runId, outcomes[call++]));
    const startRetryRun = vi.fn(async () => `run-${++nextRun}`);
    const { result: final, attempts } = await orchestrateWithAutoRetry({ firstRunId: 'run-1', orchestrate, startRetryRun, markFailed: vi.fn() });
    expect(attempts).toBe(2);
    expect(orchestrate.mock.calls.map(([id]) => id)).toEqual(['run-1', 'run-2']);
    expect(startRetryRun).toHaveBeenCalledWith('run-1'); // the retry is linked to (and charged against) the failed run
    expect(final?.outcome.kind).toBe('success');
    expect(final?.billingEventId).toBe('evt-run-2');
  });

  it(`stops after ${AUTONOMOUS_MAX_ATTEMPTS} attempts (a failed run costs nothing)`, async () => {
    let n = 0;
    const orchestrate = vi.fn(async (runId: string) => result(runId, 'failed'));
    const startRetryRun = vi.fn(async () => `run-${++n + 1}`);
    const { result: final, attempts } = await orchestrateWithAutoRetry({ firstRunId: 'run-1', orchestrate, startRetryRun, markFailed: vi.fn() });
    expect(attempts).toBe(AUTONOMOUS_MAX_ATTEMPTS);
    expect(orchestrate).toHaveBeenCalledTimes(AUTONOMOUS_MAX_ATTEMPTS);
    expect(final?.outcome.kind).toBe('failed');
  });

  it.each(['success', 'blocked', 'cancelled'] as const)('never retries a %s outcome', async (kind) => {
    const orchestrate = vi.fn(async (runId: string) => result(runId, kind));
    const startRetryRun = vi.fn(async () => 'run-2');
    await orchestrateWithAutoRetry({ firstRunId: 'run-1', orchestrate, startRetryRun, markFailed: vi.fn() });
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(startRetryRun).not.toHaveBeenCalled();
  });

  it('a retry the Ticket Balance cannot cover ($3.00) does not start — the failed result stands', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const orchestrate = vi.fn(async (runId: string) => result(runId, 'failed'));
    const startRetryRun = vi.fn(async () => { throw new Error('Ticket Balance too low to retry: a retry costs $3.00'); });
    const { result: final, attempts } = await orchestrateWithAutoRetry({ firstRunId: 'run-1', orchestrate, startRetryRun, markFailed: vi.fn() });
    expect(attempts).toBe(1);
    expect(orchestrate).toHaveBeenCalledTimes(1);
    expect(final?.outcome.kind).toBe('failed');
  });

  it('an unexpected exception marks that run failed and stops', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const markFailed = vi.fn(async () => {});
    const orchestrate = vi.fn(async () => { throw new Error('network'); });
    const { result: final } = await orchestrateWithAutoRetry({ firstRunId: 'run-1', orchestrate, startRetryRun: vi.fn(), markFailed });
    expect(final).toBeNull();
    expect(markFailed).toHaveBeenCalledWith('run-1');
  });
});
