/**
 * One ExecutionRecord per user request (== per conversation turn — no new
 * turn/execution boundary is invented, this reuses the one ConversationRuntime
 * already tracks). The foundation for Resume/Continue/Timeline/Analytics.
 * Internal name is "Execution"; anything user-facing calls this Work History /
 * Completed Work / Timeline instead.
 */

/** Mirrors the action lifecycle (prepare/execute/observe/verify/recover) as queue-entry state — internal bookkeeping only, never shown to the user directly. */
export type QueuedActionState =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'observing'
  | 'verifying'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type VerificationResultEntry = { description: string; ok: boolean };

export type ExecutionCommandEvidence = {
  command: string;
  safeCommand: string;
  cwd?: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  exitCode?: number | null;
  status: 'completed' | 'failed' | 'blocked';
  output?: string;
  stdoutSummary?: string;
  stderrSummary?: string;
};

export type ExecutionFileEvidence = {
  operation: 'CREATE' | 'MODIFY' | 'DELETE' | 'RENAME';
  path: string;
  relativePath?: string;
  timestamp: number;
  result: 'completed' | 'failed' | 'blocked';
  sizeBytes?: number;
};

export type ExecutionDiffEvidence = {
  timestamp: number;
  filesChanged: { path: string; added: number; deleted: number }[];
  totalAdded: number;
  totalDeleted: number;
  summary: string;
  fullDiff?: string;
};

export type ExecutionVerificationEvidence = {
  type: 'TYPECHECK' | 'BUILD' | 'TEST' | 'LINT' | 'PREVIEW' | 'HEALTH_CHECK' | 'VISUAL_QA' | 'COMMAND' | 'VALIDATION';
  action: string;
  status: 'passed' | 'failed' | 'skipped' | 'not_performed';
  timestamp: number;
  durationMs?: number;
  summary: string;
  failureReason?: string;
  screenshotRef?: string;
  target?: string;
};

/** One step of the record's own Timeline — mirrors the renderer's Task Card actions so History stores the same trace, not a lossy summary of it. */
export type ExecutionTimelineEntry = {
  type: string;
  ok: boolean;
  label: string;
  startedAt: number;
  endedAt: number;
};

export type ExecutionRecord = {
  id: string;
  goal: string;
  status: 'in_progress' | 'completed' | 'failed' | 'abandoned';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  applicationsUsed: string[];
  aiWorkersUsed: string[];
  commandsExecuted: string[];
  filesCreated: string[];
  filesModified: string[];
  verificationResults: VerificationResultEntry[];
  commandEvidence?: ExecutionCommandEvidence[];
  fileEvidence?: ExecutionFileEvidence[];
  diffEvidence?: ExecutionDiffEvidence[];
  verificationEvidence?: ExecutionVerificationEvidence[];
  recoveryAttempts: number;
  timeline: ExecutionTimelineEntry[];
  summary: string;
  stoppedReason?: string;
  nextAction?: string;
  pawComputeUsed?: number;
  pawComputeRemaining?: number | null;
  projectId?: string;
  taskId?: string;
  userId?: string;
  runtime?: string;
  organizationId?: string;
  /** Set only when this ExecutionRecord was produced by a headless turn the Autonomous Orchestration
   *  Layer drove on behalf of an autonomous_task_runs row (Supabase) — carries that row's own id, the
   *  one real cross-system link between local Work History and the autonomous run it belongs to. Never
   *  set for a normal, human-driven conversation turn. See AutonomousOrchestrator.ts. */
  externalRunId?: string;
};
