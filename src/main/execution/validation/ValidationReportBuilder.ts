import { v4 as uuidv4 } from 'uuid';
import { VALIDATION_STEP_ORDER, type ValidationConfidence, type ValidationReport, type ValidationStepId, type ValidationStepResult } from './ValidationReportTypes';
import { diagnoseFailure } from './ValidationFailureDiagnosis';

const STEP_LABELS: Record<ValidationStepId, string> = {
  syntax: 'Syntax check',
  imports: 'Import check',
  typeCheck: 'Type check',
  lint: 'Lint',
  build: 'Build',
  tests: 'Tests',
};

export type ValidationStepResults = Record<ValidationStepId, ValidationStepResult>;

/**
 * How much the report's overall verdict should be trusted — never a flat 'high'. 'low' when more
 * steps were skipped than actually ran (too little real evidence gathered to say much); 'medium'
 * when any step that did run used an inferred (not project-declared) command, since an inferred
 * command might not exactly match this project's real workflow; 'high' otherwise (every step that
 * ran either used the project's own declared script or is a deterministic structural check).
 */
function computeConfidence(steps: ValidationStepResults): ValidationConfidence {
  const values = VALIDATION_STEP_ORDER.map((id) => steps[id]);
  const skippedCount = values.filter((s) => s.status === 'skipped').length;
  if (skippedCount > values.length / 2) return 'low';
  if (values.some((s) => s.source === 'inferred')) return 'medium';
  return 'high';
}

/**
 * Coding Runtime V2, Validation Pipeline (§12) — aggregates six independently-run step results into
 * one structured report. Pure: takes already-executed step results, does no I/O itself (the
 * orchestrating plugin runs each check and passes the results in) — the same "pure composition over
 * already-gathered facts" shape `FeatureMapBuilder.buildFeatureMap()`/`RepositorySemanticIndexBuilder.
 * buildIndex()` already established for this codebase.
 */
export function buildValidationReport(projectRoot: string, steps: ValidationStepResults): ValidationReport {
  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  for (const stepId of VALIDATION_STEP_ORDER) {
    const step = steps[stepId];
    if (step.status === 'failed') {
      blockingIssues.push(`${STEP_LABELS[stepId]} failed${step.errorDetail ? `: ${step.errorDetail}` : '.'}`);
    } else if (step.status === 'skipped') {
      warnings.push(`${STEP_LABELS[stepId]} skipped${step.skippedReason ? `: ${step.skippedReason}` : '.'}`);
    }
  }

  const report: ValidationReport = {
    id: uuidv4(),
    projectRoot,
    runAt: Date.now(),
    syntax: steps.syntax,
    imports: steps.imports,
    typeCheck: steps.typeCheck,
    lint: steps.lint,
    build: steps.build,
    tests: steps.tests,
    blockingIssues,
    warnings,
    confidence: computeConfidence(steps),
  };

  const suggestedRecovery = diagnoseFailure(report);
  if (suggestedRecovery) report.suggestedRecovery = suggestedRecovery;

  return report;
}
