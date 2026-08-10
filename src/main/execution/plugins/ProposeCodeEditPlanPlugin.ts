import type { ActionRequest, ActionResult } from '../../../shared/actions/ActionTypes';
import type { ExecutionPlan } from '../../../shared/actions/ExecutionLifecycle';
import { BasePlugin } from '../BasePlugin';
import { describeFailure } from '../describeFailure';
import { buildCodeEditPlan } from '../../planning/CodeEditPlanner';
import { recordCodingEditRequest } from '../../memory/entities/codingEditRequestEntities';

/**
 * Coding Runtime V2, Multi-file Editing Engine (§10) — the model-facing entry point for a code-edit
 * batch, mirroring ProposeExecutionPlanPlugin exactly: it never applies anything itself
 * (CodeEditPlanner.buildCodeEditPlan is a pure function), it only records the request (so the
 * resulting plan's sourceReportId points at a real, explainable entity) and returns a reviewable
 * ExecutionPlan for the user to approve before any `applyCodeEdit` step actually runs through the
 * normal, unmodified DesktopExecutionEngine.execute() path.
 */
export class ProposeCodeEditPlanPlugin extends BasePlugin {
  id = 'proposeCodeEditPlan';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'proposeCodeEditPlan';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'proposeCodeEditPlan') return [];
    if (!request.edits || request.edits.length === 0) {
      return [{ id: 'no-edits', message: 'Which file(s) should this edit plan touch, and what should change in each?' }];
    }
    const empty = request.edits.find((e) => e.edits.length === 0);
    if (empty) {
      return [{ id: 'empty-file-edit', message: `No actual edit hunks were given for "${empty.path}".` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'proposeCodeEditPlan') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.edits || request.edits.length === 0) {
      return { ok: false, reason: 'failed', message: 'Provide at least one file edit to plan.' };
    }

    const entity = recordCodingEditRequest(request.description, request.edits.map((e) => e.path));
    const plan = buildCodeEditPlan(entity.id, request.edits);

    return { ok: true, data: plan };
  }

  describeInProgress(): string {
    return 'Putting together a multi-file edit plan…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'proposeCodeEditPlan') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const plan = result.data as ExecutionPlan | undefined;
    if (!plan) return 'Done.';
    const fileCount = plan.steps.length;
    return `Proposed an edit plan touching ${fileCount} file${fileCount === 1 ? '' : 's'} — review and approve before anything is applied.`;
  }
}

export const proposeCodeEditPlanPlugin = new ProposeCodeEditPlanPlugin();
