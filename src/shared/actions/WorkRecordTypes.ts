import type { ExecutionRecord } from './ExecutionRecordTypes';

export type WorkRecordState =
  | 'DRAFT'
  | 'REVIEW'
  | 'APPROVED'
  | 'BUILDING'
  | 'TESTING'
  | 'PREVIEW'
  | 'VISUAL_QA'
  | 'PRODUCTION_CHECK'
  | 'COMPLETED'
  | 'INCOMPLETE'
  | 'FAILED'
  | 'STOPPED';

export type WorkRecordTimelineItem = {
  timestamp: number;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  detail?: string;
};

export type WorkRecordCommandEvidence = {
  command: string;
  cwd?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  exitCode?: number | null;
  status: 'completed' | 'failed' | 'blocked' | 'unknown';
  output?: string;
};

export type WorkRecordFileEvidence = {
  path: string;
  change: 'created' | 'modified' | 'deleted' | 'renamed';
  timestamp?: number;
  result?: 'completed' | 'failed' | 'blocked';
};

export type WorkRecordDiffEvidence = {
  summary: string;
  filesChanged: { path: string; added: number; deleted: number }[];
};

export type WorkRecordVerificationEvidence = {
  type: string;
  action: string;
  status: 'passed' | 'failed' | 'skipped' | 'not_performed';
  summary: string;
  failureReason?: string;
  timestamp: number;
};

export type WorkRecordSection<T> = {
  status: 'available' | 'empty' | 'not_required';
  items: T[];
  note?: string;
};

export type WorkRecordArchitecture = {
  nodes: string[];
  edges: { from: string; to: string; label?: string }[];
  diagram: string;
};

/**
 * The explicit evidence-presence vocabulary shown next to every Work Record
 * evidence tab. Derived purely from the real WorkRecordSection/item data
 * already computed below — never a new fact, only a stricter label for facts
 * that already exist:
 *  - CAPTURED: real evidence is present for this category.
 *  - NOT_CAPTURED: this category is architecturally never recorded by the
 *    frozen pipeline today (Plan, Architecture) — an honest capability gap,
 *    not "this specific run skipped it".
 *  - NOT_EXECUTED: this category could have evidence but this particular
 *    run has zero recorded attempts (e.g. no commands were ever run).
 *  - FAILED: real evidence exists and at least one entry recorded a failure.
 *  - BLOCKED: real evidence exists and at least one entry recorded a denial.
 */
export type WorkRecordEvidenceState = 'CAPTURED' | 'NOT_CAPTURED' | 'NOT_EXECUTED' | 'FAILED' | 'BLOCKED';

/**
 * 'blocked' = real evidence exists that this category was attempted and denied (e.g. a
 * commandEvidence/fileEvidence entry with status/result === 'blocked'). 'not_executed' = this
 * category has zero recorded evidence — honest about absence, never implies an attempt happened.
 */
export type WorkRecordBlockedItem = {
  label: string;
  status: 'blocked' | 'not_executed';
};

export type WorkRecordBlockedSummary = {
  reason?: string;
  nextAction?: string;
  completedSteps: string[];
  incompleteAreas: WorkRecordBlockedItem[];
};

export type WorkRecord = {
  id: string;
  source: ExecutionRecord;
  identity: {
    workId: string;
    projectId?: string;
    taskId?: string;
    userId?: string;
    runtime?: string;
    organizationId?: string;
  };
  request: {
    original: string;
    normalizedGoal: string;
  };
  state: WorkRecordState;
  createdAt: number;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  timeline: WorkRecordTimelineItem[];
  plan: WorkRecordSection<string>;
  architecture: WorkRecordSection<WorkRecordArchitecture>;
  commands: WorkRecordSection<WorkRecordCommandEvidence>;
  files: WorkRecordSection<WorkRecordFileEvidence>;
  diffs: WorkRecordSection<WorkRecordDiffEvidence>;
  verification: WorkRecordSection<WorkRecordVerificationEvidence>;
  usage: {
    pawComputeUsed?: number;
    pawComputeRemaining?: number | null;
  };
  completion: {
    status: 'COMPLETED' | 'INCOMPLETE' | 'FAILED' | 'STOPPED';
    reason?: string;
    nextAction?: string;
  };
  /** Only present when completion.status is 'FAILED' or 'STOPPED'. */
  blocked?: WorkRecordBlockedSummary;
};
