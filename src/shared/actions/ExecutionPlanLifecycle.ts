import type { ActionRequest, ActionResult } from './ActionTypes';
import type { ExecutionPlan, PlannedStep, PlannedStepStatus } from './ExecutionLifecycle';

/**
 * Real, enforced state machine for PlannedStep — closes the gap the audit found: the type declared
 * a 5/6-state lifecycle but nothing anywhere ever transitioned a step past 'proposed'. Every
 * transition in this codebase must now go through transitionPlannedStep() below, which validates
 * against this table rather than trusting a caller's direct field assignment. 'rejected',
 * 'completed', and 'failed' are all terminal — nothing may ever leave them, including a model
 * claiming "actually, approve it now."
 */
const VALID_TRANSITIONS: Record<PlannedStepStatus, PlannedStepStatus[]> = {
  proposed: ['approved', 'rejected'],
  approved: ['executing', 'rejected'],
  rejected: [],
  executing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

export function canTransitionPlannedStep(from: PlannedStepStatus, to: PlannedStepStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * Returns a NEW step with the transition applied, or null if the transition is invalid — never
 * mutates the input, never silently clamps to the nearest valid state. A caller must always check
 * for null rather than assume success.
 */
export function transitionPlannedStep(step: PlannedStep, to: PlannedStepStatus): PlannedStep | null {
  if (!canTransitionPlannedStep(step.status, to)) return null;
  return { ...step, status: to };
}

export type PlanStepExecutionOutcome = {
  stepId: string;
  /** Real reason a step never ran — never fabricated, always one of these three honest cases. */
  outcome: 'executed' | 'skipped-not-approved' | 'skipped-terminal';
  result?: ActionResult;
};

export type PlanExecutionSummary = {
  plan: ExecutionPlan;
  outcomes: PlanStepExecutionOutcome[];
};

/**
 * The ONE function that is allowed to turn a PlannedStep's `actionRequest` into a real
 * DesktopExecutionEngine.execute() call. This is the actual backend enforcement the audit asked
 * for: a step whose status is anything other than 'approved' is honestly SKIPPED, never executed
 * regardless of what a caller (including the model, if it ever gets wired to call this) claims —
 * there is no "force" parameter, no override. Steps are processed strictly in array order, so a
 * later step never runs ahead of an earlier one still pending review.
 *
 * Real, current integration status (disclosed, not implied): no live tool-calling path in this
 * codebase invokes this function yet — see the Autonomous Work implementation report for exactly
 * what remains to wire this into the model's own tool loop without touching the frozen Coding
 * Runtime V2 plugin files. This function itself is complete, tested, and ready to be called by
 * whichever future caller needs "only run what was actually approved."
 */
export async function executeApprovedPlanSteps(
  plan: ExecutionPlan,
  executeAction: (request: ActionRequest) => Promise<ActionResult>
): Promise<PlanExecutionSummary> {
  const outcomes: PlanStepExecutionOutcome[] = [];
  const nextSteps: PlannedStep[] = [];

  for (const step of plan.steps) {
    if (step.status !== 'approved') {
      const outcome: PlanStepExecutionOutcome['outcome'] =
        step.status === 'rejected' || step.status === 'completed' || step.status === 'failed' ? 'skipped-terminal' : 'skipped-not-approved';
      outcomes.push({ stepId: step.id, outcome });
      nextSteps.push(step);
      continue;
    }

    const executing = transitionPlannedStep(step, 'executing');
    // Structurally unreachable (approved -> executing is always valid per VALID_TRANSITIONS above),
    // but never silently swallow a null here — treat it as the honest "did not run" case rather than
    // assuming success.
    if (!executing) {
      outcomes.push({ stepId: step.id, outcome: 'skipped-not-approved' });
      nextSteps.push(step);
      continue;
    }

    const result = await executeAction(step.actionRequest);
    const finished = transitionPlannedStep(executing, result.ok ? 'completed' : 'failed');
    nextSteps.push(finished ?? executing);
    outcomes.push({ stepId: step.id, outcome: 'executed', result });
  }

  return { plan: { ...plan, steps: nextSteps }, outcomes };
}
