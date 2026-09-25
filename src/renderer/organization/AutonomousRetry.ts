import type { AutonomousOrchestrationResult } from './AutonomousOrchestrator';

/** First attempt plus two automatic retries. */
export const AUTONOMOUS_MAX_ATTEMPTS = 3;

/**
 * Runs an autonomous ticket and, when a run ends 'failed', retries it straight away as a fresh run
 * for the same ticket — up to AUTONOMOUS_MAX_ATTEMPTS in total. Pricing (server-side): the failed
 * run itself costs nothing; every retry costs $3.00 when it starts; the attempt that completes is
 * charged the ticket price. A retry the Ticket Balance can't cover simply doesn't start.
 * 'blocked' (needs the user: connect a connector, top up, …), 'cancelled' and successful outcomes
 * are never retried. An unexpected exception marks that run failed and stops.
 */
export async function orchestrateWithAutoRetry(deps: {
  firstRunId: string;
  orchestrate: (runId: string) => Promise<AutonomousOrchestrationResult>;
  startRetryRun: (failedRunId: string) => Promise<string>;
  markFailed: (runId: string) => Promise<void>;
  maxAttempts?: number;
  onRetry?: (attempt: number, previous: AutonomousOrchestrationResult) => void;
}): Promise<{ result: AutonomousOrchestrationResult | null; attempts: number }> {
  const maxAttempts = deps.maxAttempts ?? AUTONOMOUS_MAX_ATTEMPTS;
  let runId = deps.firstRunId;
  for (let attempt = 1; ; attempt++) {
    let result: AutonomousOrchestrationResult;
    try {
      result = await deps.orchestrate(runId);
    } catch (error) {
      await deps.markFailed(runId).catch(() => undefined);
      // eslint-disable-next-line no-console
      console.error('Autonomous orchestration failed unexpectedly', error);
      return { result: null, attempts: attempt };
    }
    if (result.outcome.kind !== 'failed' || attempt >= maxAttempts) {
      return { result, attempts: attempt };
    }
    deps.onRetry?.(attempt, result);
    try {
      runId = await deps.startRetryRun(runId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Autonomous retry could not start', error);
      return { result, attempts: attempt };
    }
  }
}
