import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { ExecutionPlan } from '../../../../shared/actions/ExecutionLifecycle';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { buildPlan } from '../../../planning/ExecutionPlanner';
import { findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

/**
 * The one Execute-class plugin in the entire Intelligence capability area (see
 * CODING_EXECUTION_ACTION_TYPES) — every other Intelligence plugin is read-only analysis and
 * structurally incapable of mutating anything, so only turning findings into a real plan is gated
 * Pro+. This plugin itself still never executes anything: it looks up the already-persisted report
 * for (engineId, subject) and hands it to ExecutionPlanner.buildPlan(), which is a pure function.
 * Running any resulting step is a separate, later action through the normal, unmodified
 * DesktopExecutionEngine.execute() path — this plugin has no method that does that.
 */
export class ProposeExecutionPlanPlugin extends BasePlugin {
  id = 'proposeExecutionPlan';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'proposeExecutionPlan';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'proposeExecutionPlan') return [];
    if (!request.approvedFindingIds || request.approvedFindingIds.length === 0) {
      return [{ id: 'no-approved-findings', message: 'Which finding(s) from that report should I turn into an execution plan?' }];
    }
    const entity = findLatestIntelligenceReport(request.engineId, request.subject);
    if (!entity) {
      return [{ id: 'report-missing', message: `I don't have a ${request.engineId} Intelligence report for "${request.subject}" yet — run the matching analysis first.` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'proposeExecutionPlan') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.approvedFindingIds || request.approvedFindingIds.length === 0) {
      return { ok: false, reason: 'failed', message: 'Provide at least one approved finding id to plan.' };
    }
    const entity = findLatestIntelligenceReport(request.engineId, request.subject);
    if (!entity) {
      return { ok: false, reason: 'failed', message: `No ${request.engineId} Intelligence report found for "${request.subject}".` };
    }

    const report = (entity.attributes as { report: IntelligenceReport }).report;
    const plan = buildPlan(report, entity.id, request.approvedFindingIds);

    return { ok: true, data: plan };
  }

  describeInProgress(): string {
    return 'Building an execution plan from the approved findings…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'proposeExecutionPlan') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const plan = result.data as ExecutionPlan | undefined;
    if (!plan) return 'Done.';
    const stepCount = plan.steps.length;
    const unplannableCount = plan.unplannableFindingIds.length;
    const suffix = unplannableCount > 0 ? ` (${unplannableCount} approved finding${unplannableCount === 1 ? '' : 's'} had no safe automated fix and were left out)` : '';
    return `Proposed a plan with ${stepCount} step${stepCount === 1 ? '' : 's'}${suffix} — review and approve before anything runs.`;
  }
}

export const proposeExecutionPlanPlugin = new ProposeExecutionPlanPlugin();
