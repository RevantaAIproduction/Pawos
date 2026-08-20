import { describe, expect, it } from 'vitest';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';
import type { ConversationTaskAction, ConversationTaskRecord } from './ConversationTypes';
import {
  buildPlanDecisionMessage,
  buildPlanReviewModel,
  buildProposedDiff,
  getPlanScope,
  getPlanStepPath,
} from './planReviewModel';

const edit = {
  contextBefore: ['export function issueSession(user: User) {'],
  oldLines: ['  return createSession(user.id);'],
  newLines: ['  validateRefreshToken(user.refreshToken);', '  return createSession(user.id);'],
  contextAfter: ['}'],
};

function makePlan(): ExecutionPlan {
  return {
    id: 'plan-auth-refresh',
    sourceReportId: 'report-auth',
    approvalRequired: true,
    unplannableFindingIds: ['finding-manual-oauth'],
    steps: [
      {
        id: 'step-edit-session',
        findingRefs: ['finding-refresh-token'],
        status: 'proposed',
        rationale: 'Add refresh-token validation before issuing a session.',
        actionRequest: {
          type: 'applyCodeEdit',
          path: 'src/auth/session.ts',
          edits: [edit],
          planId: 'plan-auth-refresh',
        },
      },
      {
        id: 'step-write-helper',
        findingRefs: ['finding-refresh-token'],
        status: 'proposed',
        rationale: 'Add the helper module used by the session change.',
        actionRequest: {
          type: 'writeFile',
          path: 'src/auth/refresh.ts',
          content: 'export function validateRefreshToken(token: string) {\n  return Boolean(token);\n}\n',
        },
      },
      {
        id: 'step-test',
        findingRefs: ['finding-refresh-token'],
        status: 'proposed',
        rationale: 'Run the existing auth test suite after mutation approval.',
        actionRequest: {
          type: 'runCommand',
          cwd: 'C:/repo',
          command: 'npm test -- auth',
        },
      },
    ],
  };
}

function makeAction(): ConversationTaskAction {
  return {
    id: 'a-plan',
    type: 'proposeCodeEditPlan',
    request: {
      type: 'proposeCodeEditPlan',
      description: 'Validate refresh tokens before issuing sessions',
      edits: [{ path: 'src/auth/session.ts', edits: [edit], rationale: 'Add refresh-token validation.' }],
    },
    startedAt: 0,
    endedAt: 1,
    inProgressText: '',
  };
}

function makeTask(action: ConversationTaskAction): ConversationTaskRecord {
  return {
    id: 't-plan',
    goal: 'Improve auth safety',
    status: 'running',
    startedAt: 0,
    endedAt: null,
    actions: [action],
  };
}

describe('planReviewModel', () => {
  it('builds a review model from real plan title, paths, scope, and permission facts', () => {
    const action = makeAction();
    const plan = makePlan();
    const model = buildPlanReviewModel(makeTask(action), action, plan);

    expect(model.title).toBe('Validate refresh tokens before issuing sessions');
    expect(model.scope).toMatchObject({
      files: 3,
      steps: 3,
      added: 5,
      deleted: 1,
      changeSteps: 1,
      writeSteps: 1,
      commandSteps: 1,
      authorizationSteps: 3,
    });
    expect(model.steps.map((step) => step.path)).toEqual(['src/auth/session.ts', 'src/auth/refresh.ts', 'C:/repo']);
    expect(model.permissionSummary).toContain('3 steps');
    expect(model.unplannableCount).toBe(1);
  });

  it('renders proposed patch hunks without inventing diffs for non-patch steps', () => {
    const plan = makePlan();

    expect(buildProposedDiff(plan.steps[0]!)).toContain('-  return createSession(user.id);');
    expect(buildProposedDiff(plan.steps[0]!)).toContain('+  validateRefreshToken(user.refreshToken);');
    expect(buildProposedDiff(plan.steps[1]!)).toBeUndefined();

    const model = buildPlanReviewModel(makeTask(makeAction()), makeAction(), plan);
    expect(model.steps[0]?.diffState).toBe('available');
    expect(model.steps[1]?.diffState).toBe('unavailable');
  });

  it('keeps approval language separate from later mutation authorization', () => {
    expect(buildPlanDecisionMessage('plan-123', 'approved')).toContain('existing authorization gates');
    expect(buildPlanDecisionMessage('plan-123', 'approved')).toContain('code edits, commands, git writes');
    expect(buildPlanDecisionMessage('plan-123', 'rejected')).toContain('Do not apply');
  });

  it('falls back to task goal and step action data instead of fabricating missing facts', () => {
    const action = makeAction();
    const plan: ExecutionPlan = {
      ...makePlan(),
      steps: [
        {
          id: 'step-memory',
          findingRefs: [],
          status: 'proposed',
          rationale: 'Record the decision after review.',
          actionRequest: {
            type: 'recordArchitecturalDecision',
            rootPath: 'C:/repo',
            decision: 'Use refresh-token validation',
            rationale: 'Auth safety',
          },
        },
      ],
      unplannableFindingIds: [],
    };
    const blankAction = { ...action, request: { ...action.request, description: '' } };
    const task = makeTask(blankAction);
    const model = buildPlanReviewModel(task, blankAction, plan);

    expect(model.title).toBe('Improve auth safety');
    expect(getPlanStepPath(plan.steps[0]!)).toBeUndefined();
    expect(getPlanScope(plan)).toMatchObject({ files: 1, added: 0, deleted: 0, authorizationSteps: 0 });
  });
});
