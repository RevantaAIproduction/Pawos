/**
 * Coding Runtime V2, Validation Pipeline (§12) — the structured report every validation run
 * produces. Every field must come from a real, executed check — never fabricated for a stage that
 * didn't run (see `status: 'skipped'` + `skippedReason`, the same honesty discipline as
 * `BuildStatus`/`TestRunSummary` in ExecutionLifecycle.ts). Persisted through the Memory Graph
 * (`codingValidationReportEntities.ts`) rather than existing only as transient console/ActionResult
 * output, so the Self-Healing Workflow (and later, Coding Runtime Memory) can reuse a real historical
 * record instead of re-deriving one.
 */
export type ValidationStepId = 'syntax' | 'imports' | 'typeCheck' | 'lint' | 'build' | 'tests';

export type ValidationStepStatus = 'passed' | 'failed' | 'skipped';

/** Where a lint/typecheck/build/test command actually came from — a real `package.json` script vs. a
 * conservative fallback this pipeline chose itself. `syntax`/`imports` never set this (they call the
 * Language Provider / import-resolution logic directly, not a shell command). */
export type ValidationCommandSource = 'packageScript' | 'inferred';

export type ValidationStepResult = {
  status: ValidationStepStatus;
  /** Why this step was skipped — always present when status is 'skipped', never fabricated as if the check ran. */
  skippedReason?: string;
  source?: ValidationCommandSource;
  command?: string;
  durationMs?: number;
  /** Best-effort tail of real error output — never fabricated, present only on a real failure. */
  errorDetail?: string;
  /** Files this step's failure was traced to, when known (syntax/imports checks report the exact file). */
  affectedFiles?: string[];
  /** Real counts when parseable (tests only, reusing TestResultParser's own discipline). */
  passed?: number;
  failed?: number;
  total?: number;
};

/**
 * How much the overall report's verdict should be trusted — never a fixed 'high' regardless of what
 * was actually checked. 'low' when most steps were skipped (too little real evidence gathered);
 * 'medium' when any step that ran used an inferred (not project-declared) command, since an inferred
 * command might not exactly match the project's real workflow; 'high' otherwise.
 */
export type ValidationConfidence = 'high' | 'medium' | 'low';

export type SuggestedRecovery = {
  targetStep: ValidationStepId;
  summary: string;
  errorDetail: string;
  affectedFiles?: string[];
};

export type ValidationReport = {
  id: string;
  projectRoot: string;
  runAt: number;
  syntax: ValidationStepResult;
  imports: ValidationStepResult;
  typeCheck: ValidationStepResult;
  lint: ValidationStepResult;
  build: ValidationStepResult;
  tests: ValidationStepResult;
  /** One human-readable line per failed (non-skipped) step. */
  blockingIssues: string[];
  /** One human-readable line per skipped step — informational, never blocking. */
  warnings: string[];
  confidence: ValidationConfidence;
  /** The single most likely root cause, if any step failed — always the earliest-failing step in
   * pipeline order (syntax -> imports -> typeCheck -> lint -> build -> tests), since an earlier
   * structural failure is the most common real cause of every later one. Absent when nothing failed. */
  suggestedRecovery?: SuggestedRecovery;
};

/** The pipeline's own fixed stage order — also the order `diagnoseFailure()` scans in to pick the earliest real failure as the most likely root cause. */
export const VALIDATION_STEP_ORDER: ValidationStepId[] = ['syntax', 'imports', 'typeCheck', 'lint', 'build', 'tests'];
