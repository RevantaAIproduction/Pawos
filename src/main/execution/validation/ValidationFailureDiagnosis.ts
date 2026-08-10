import { VALIDATION_STEP_ORDER, type ValidationReport, type SuggestedRecovery } from './ValidationReportTypes';

const STEP_LABELS: Record<string, string> = {
  syntax: 'Syntax check',
  imports: 'Import check',
  typeCheck: 'Type check',
  lint: 'Lint',
  build: 'Build',
  tests: 'Tests',
};

/**
 * Coding Runtime V2, Self-Healing Workflow (§13) — picks the single most likely root cause out of
 * every failed step, rather than surfacing all of them redundantly. Always the *earliest* failing
 * step in pipeline order (syntax -> imports -> typeCheck -> lint -> build -> tests): a structural
 * problem near the front of the pipeline (a syntax error, a broken import) is the most common real
 * cause of everything after it failing too, so pointing at the earliest failure is the most useful,
 * most explainable single diagnosis — not a claim that later failures are definitely caused by it.
 */
export function diagnoseFailure(report: ValidationReport): SuggestedRecovery | null {
  for (const stepId of VALIDATION_STEP_ORDER) {
    const step = report[stepId];
    if (step.status !== 'failed') continue;
    return {
      targetStep: stepId,
      summary: `${STEP_LABELS[stepId] ?? stepId} failed — this is the earliest failing step, and the most likely place to start.`,
      errorDetail: step.errorDetail ?? 'No further detail was captured for this failure.',
      affectedFiles: step.affectedFiles,
    };
  }
  return null;
}
