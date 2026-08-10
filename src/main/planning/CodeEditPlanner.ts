import { v4 as uuidv4 } from 'uuid';
import type { CodeEditHunk } from '../../shared/actions/ActionTypes';
import type { ExecutionPlan, PlannedStep } from '../../shared/actions/ExecutionLifecycle';

export type ProposedFileEdit = {
  path: string;
  edits: CodeEditHunk[];
  rationale: string;
};

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — the Think -> Plan boundary for code edits,
 * a sibling to ExecutionPlanner.buildPlan() with the same discipline: pure, never calls execute(),
 * never imports DesktopExecutionEngine. Unlike ExecutionPlanner (which maps a report's Findings to
 * steps through a rule table, and can leave a finding unplannable when no rule matches), every
 * ProposedFileEdit this function receives already has a deterministic, direct mapping to one
 * `applyCodeEdit` step — there is no "no safe automation exists" case here, so
 * `unplannableFindingIds` is always empty. `findingRefs` is always empty too: it names Intelligence
 * Finding ids specifically (see ExecutionLifecycle.ts's own doc comment), which a code-edit request
 * has none of — the step's `rationale` carries the real justification instead.
 */
export function buildCodeEditPlan(sourceRequestId: string, proposedEdits: ProposedFileEdit[]): ExecutionPlan {
  const steps: PlannedStep[] = proposedEdits.map((edit) => ({
    id: uuidv4(),
    findingRefs: [],
    // planId ties this step's eventual codingEditHistory record (§14) back to the plan the user
    // reviewed — see ActionTypes.ts's doc comment on applyCodeEdit's optional planId field.
    actionRequest: { type: 'applyCodeEdit', path: edit.path, edits: edit.edits, planId: sourceRequestId },
    rationale: edit.rationale,
    status: 'proposed',
  }));

  return {
    id: uuidv4(),
    sourceReportId: sourceRequestId,
    steps,
    unplannableFindingIds: [],
    approvalRequired: true,
  };
}
