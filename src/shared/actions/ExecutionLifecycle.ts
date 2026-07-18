/**
 * Additive types for the action lifecycle (prepare/execute/observe/verify/
 * recover) — never required, so every existing plugin/caller that only knows
 * about {ok, data|reason/message} keeps working unchanged.
 */

/** One intermediate signal surfaced mid-execution, e.g. "Waiting for port 3000…", "Build reached 100%". */
export type ObservationEvent = {
  at: number;
  message: string;
  data?: unknown;
};

/** Attached to an ActionResult by DesktopExecutionEngine when it had to observe/recover, so narration and Work History can report honestly instead of inferring from a bare exit code. */
export type ExecutionTrail = {
  attempts: number;
  recovered: boolean;
  observations: ObservationEvent[];
};

/** Pushed live to the renderer (workspace:observation channel) as each ObservationEvent is yielded, same push-channel shape as process:output. */
export type WorkspaceObservationEvent = {
  actionType: string;
  event: ObservationEvent;
};

/**
 * Additive result-data contract for deterministic, multi-step composite
 * plugins (e.g. Comparison Workflow) — any ActionResult.data that includes
 * these fields gets a "Workflow" summary rendered automatically by the Task
 * Card (TaskCard.tsx), with zero UI changes needed when a future runtime
 * adds its own workflow-shaped plugin. Duration/Recovery Attempts/Final
 * Result aren't part of this shape because they're already generic,
 * per-action facts the Task Card has (startedAt/endedAt, result.trail,
 * doneText) — this only adds what a plugin alone actually knows.
 */
export type WorkflowMetadata = {
  workflowName: string;
  plan: string[];
  candidatesProcessed: number;
  successfulSteps: number;
  failedSteps: number;
};

/**
 * Additive result-data contract for a real build outcome, detected the
 * same opportunistic way as WorkflowMetadata (TaskCard.tsx checks the
 * shape, not the action type). Every field must come from something the
 * producing plugin already verified for real — a build output directory
 * that actually exists, a duration ProcessManager actually measured, a
 * buildTool name only when there's a genuinely unambiguous signal for it
 * (e.g. a previously-analyzed project's recorded build tool) — never a
 * guess dressed up as a fact.
 */
export type BuildStatus = {
  buildTool?: string;
  status: 'success' | 'failed';
  outputDir?: string;
  durationMs?: number;
  /** Best-effort error snippet extracted from the build's own stdout/stderr — never fabricated, absent when none was found. */
  failureDetail?: string;
};

/**
 * Additive result-data contract for a coding task's declared checklist —
 * detected the same opportunistic way as WorkflowMetadata/BuildStatus
 * (shape, not action type). The model declares the full item list once via
 * setTaskChecklist and re-calls it with updated statuses as work
 * progresses; only the latest call's shape is shown, same "latest wins"
 * precedent as getBuildStatus. No taskId needed — the current task's own
 * actions array IS the scope, exactly like every other shape-detected
 * contract here.
 */
export type TodoProgressItem = { id: string; label: string; status: 'pending' | 'inProgress' | 'done' | 'skipped' };
export type TodoProgress = { items: TodoProgressItem[] };

/**
 * Additive result-data contract for a test run, attached by RunCommandPlugin
 * when the command looks like a test-runner invocation (TestResultParser.ts).
 * Never fabricates pass/fail counts — 'passed'/'failed'/'total' are only
 * ever present when a real summary line was matched; otherwise only
 * `status` is set, honestly derived from the real exit code alone.
 */
export type TestRunSummary = {
  status: 'passed' | 'failed' | 'unknown';
  passed?: number;
  failed?: number;
  total?: number;
  /** Best-effort error snippet extracted from the test run's own stdout/stderr — never fabricated, absent when none was found. */
  failureDetail?: string;
};

/**
 * Additive result-data contract for "Live Code Diff" (GitDiffStatPlugin) —
 * real per-file +/- line counts from `git diff --numstat`, never fabricated.
 */
export type FileDiffStat = { path: string; added: number; deleted: number };
export type CodeDiffStat = { filesChanged: FileDiffStat[]; totalAdded: number; totalDeleted: number };

/**
 * Additive result-data contract for Visual Verification, detected the
 * same opportunistic way as WorkflowMetadata/BuildStatus (TaskCard.tsx
 * checks the shape, not the action type). `base64Png` is the exact same
 * screenshot bytes CDP actually captured and vision actually analyzed —
 * never a separately generated/faked preview image.
 */
export type VisualEvidence = {
  ok: boolean;
  issues: string[];
  base64Png: string;
};
