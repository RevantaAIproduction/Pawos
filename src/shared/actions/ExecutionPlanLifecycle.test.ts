import { describe, expect, it, vi } from 'vitest';
import { canTransitionPlannedStep, transitionPlannedStep, executeApprovedPlanSteps } from './ExecutionPlanLifecycle';
import type { ExecutionPlan, PlannedStep } from './ExecutionLifecycle';
import type { ActionResult } from './ActionTypes';

function makeStep(overrides: Partial<PlannedStep> = {}): PlannedStep {
  return {
    id: 'step-1',
    findingRefs: [],
    actionRequest: { type: 'gitStatus', cwd: '/repo' },
    rationale: 'test',
    status: 'proposed',
    ...overrides,
  };
}

function makePlan(steps: PlannedStep[]): ExecutionPlan {
  return { id: 'plan-1', sourceReportId: 'report-1', steps, unplannableFindingIds: [], approvalRequired: true };
}

describe('canTransitionPlannedStep', () => {
  it.each([
    ['proposed', 'approved', true],
    ['proposed', 'rejected', true],
    ['proposed', 'executing', false],
    ['proposed', 'completed', false],
    ['approved', 'executing', true],
    ['approved', 'rejected', true],
    ['approved', 'completed', false],
    ['executing', 'completed', true],
    ['executing', 'failed', true],
    ['executing', 'approved', false],
    ['rejected', 'approved', false],
    ['rejected', 'proposed', false],
    ['completed', 'executing', false],
    ['failed', 'executing', false],
  ] as const)('%s -> %s is %s', (from, to, expected) => {
    expect(canTransitionPlannedStep(from, to)).toBe(expected);
  });
});

describe('transitionPlannedStep', () => {
  it('returns a new step with the status applied on a valid transition', () => {
    const step = makeStep({ status: 'proposed' });
    const result = transitionPlannedStep(step, 'approved');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('approved');
    expect(result).not.toBe(step);
    expect(step.status).toBe('proposed'); // never mutates the input
  });

  it('returns null on an invalid transition, never fabricates a state', () => {
    const step = makeStep({ status: 'proposed' });
    expect(transitionPlannedStep(step, 'completed')).toBeNull();
  });

  it('a model claiming "approved" on an already-rejected step cannot resurrect it', () => {
    const step = makeStep({ status: 'rejected' });
    expect(transitionPlannedStep(step, 'approved')).toBeNull();
  });
});

describe('executeApprovedPlanSteps — the real backend enforcement', () => {
  it('never executes a step that is still "proposed" — no approval, no execution', async () => {
    const executeAction = vi.fn();
    const plan = makePlan([makeStep({ status: 'proposed' })]);
    const { outcomes } = await executeApprovedPlanSteps(plan, executeAction);

    expect(executeAction).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: 'skipped-not-approved' });
  });

  it('never executes a rejected step, even though the model might claim it should proceed', async () => {
    const executeAction = vi.fn();
    const plan = makePlan([makeStep({ status: 'rejected' })]);
    const { outcomes } = await executeApprovedPlanSteps(plan, executeAction);

    expect(executeAction).not.toHaveBeenCalled();
    expect(outcomes[0]).toMatchObject({ outcome: 'skipped-terminal' });
  });

  it('executes an approved step for real, transitioning it to completed on success', async () => {
    const okResult: ActionResult = { ok: true, data: {} };
    const executeAction = vi.fn().mockResolvedValue(okResult);
    const plan = makePlan([makeStep({ status: 'approved' })]);
    const { plan: finalPlan, outcomes } = await executeApprovedPlanSteps(plan, executeAction);

    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith(plan.steps[0]!.actionRequest);
    expect(outcomes[0]).toMatchObject({ outcome: 'executed' });
    expect(finalPlan.steps[0]!.status).toBe('completed');
  });

  it('a real execution failure transitions the step to failed, never completed', async () => {
    const failResult: ActionResult = { ok: false, reason: 'failed', message: 'boom' };
    const executeAction = vi.fn().mockResolvedValue(failResult);
    const plan = makePlan([makeStep({ status: 'approved' })]);
    const { plan: finalPlan } = await executeApprovedPlanSteps(plan, executeAction);

    expect(finalPlan.steps[0]!.status).toBe('failed');
  });

  it('processes multiple steps independently — an unapproved step never blocks or is skipped incorrectly relative to an approved one', async () => {
    const executeAction = vi.fn().mockResolvedValue({ ok: true, data: {} } as ActionResult);
    const plan = makePlan([
      makeStep({ id: 'a', status: 'proposed' }),
      makeStep({ id: 'b', status: 'approved' }),
      makeStep({ id: 'c', status: 'rejected' }),
    ]);
    const { plan: finalPlan, outcomes } = await executeApprovedPlanSteps(plan, executeAction);

    expect(executeAction).toHaveBeenCalledTimes(1); // only step 'b'
    expect(outcomes.map((o) => o.outcome)).toEqual(['skipped-not-approved', 'executed', 'skipped-terminal']);
    expect(finalPlan.steps.map((s) => s.status)).toEqual(['proposed', 'completed', 'rejected']);
  });

  it('already-completed and already-failed steps are honestly reported as skipped-terminal, never re-executed', async () => {
    const executeAction = vi.fn();
    const plan = makePlan([makeStep({ id: 'x', status: 'completed' }), makeStep({ id: 'y', status: 'failed' })]);
    const { outcomes } = await executeApprovedPlanSteps(plan, executeAction);

    expect(executeAction).not.toHaveBeenCalled();
    expect(outcomes.every((o) => o.outcome === 'skipped-terminal')).toBe(true);
  });
});
