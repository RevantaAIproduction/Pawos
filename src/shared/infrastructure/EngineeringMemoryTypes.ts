import type { EngineeringReport } from './EngineeringReportTypes';

/** One entry per engineering event Paw performed or observed — deployment, rollback, incident investigation, a standalone root-cause note, or a full structured Engineering Report. Same "one already-finished record per write" discipline as ExecutionRecord. */
export type EngineeringMemoryEntryKind = 'deployment' | 'rollback' | 'incident' | 'rootCause' | 'engineeringReport' | 'pullRequestReview';

export type EngineeringMemoryEntry = {
  id: string;
  kind: EngineeringMemoryEntryKind;
  serviceName?: string;
  repositoryFullName?: string;
  summary: string;
  detail?: string;
  status: 'success' | 'failure' | 'in_progress';
  at: number;
  /** Free-form pointers to what this entry is about — deployment id, ticket id, commit sha — for later cross-referencing without a foreign key schema. */
  refs?: Record<string, string>;
  /** Other services this event touched or affected beyond the primary serviceName — e.g. a shared database outage affecting several consumers. */
  affectedServices?: string[];
  /** Real file paths actually written/committed as part of a fix — never a guess at what "should" change. */
  changedFiles?: string[];
  /** Real outcomes of tests/builds run to validate a fix — e.g. "npm test: 12 passed", "build: success". Never fabricated. */
  validationResults?: string[];
  /** True only when this event's underlying action actually required and received explicit user confirmation (confirmed: true) before executing. */
  approvedByUser?: boolean;
  /** The full structured report — only present when kind === 'engineeringReport'. */
  report?: EngineeringReport;
};
