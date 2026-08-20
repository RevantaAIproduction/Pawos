import type { ActionRequest, CodeEditHunk } from '../../shared/actions/ActionTypes';
import type { ExecutionPlan, PlannedStep, PlannedStepStatus } from '../../shared/actions/ExecutionLifecycle';
import type { ConversationTaskAction, ConversationTaskRecord } from './ConversationTypes';

export type PlanDecision = 'approved' | 'rejected';

export type PlanStepChangeKind = 'change' | 'write' | 'command' | 'git' | 'other';

export type PlanReviewStepModel = {
  id: string;
  index: number;
  status: PlannedStepStatus;
  path: string;
  actionLabel: string;
  rationale: string;
  affectedArea: string;
  diff?: string;
  diffState: 'available' | 'unavailable';
  changeKind: PlanStepChangeKind;
  requiresAuthorization: boolean;
  authorizationLabel: string;
};

export type PlanReviewStageModel = {
  label: 'Understand' | 'Plan' | 'Approve' | 'Implement' | 'Verify';
  status: 'done' | 'active' | 'pending' | 'blocked';
  description: string;
};

export type PlanScope = {
  files: number;
  added: number;
  deleted: number;
  steps: number;
  changeSteps: number;
  writeSteps: number;
  commandSteps: number;
  gitSteps: number;
  authorizationSteps: number;
};

export type PlanReviewModel = {
  id: string;
  title: string;
  scope: PlanScope;
  steps: PlanReviewStepModel[];
  stages: PlanReviewStageModel[];
  permissionSummary: string;
  terminal: boolean;
  unplannableCount: number;
};

const AUTHORIZATION_ACTION_TYPES = new Set<string>([
  'applyCodeEdit',
  'writeFile',
  'runCommand',
  'gitAdd',
  'gitCommit',
  'gitCreateBranch',
  'gitCheckout',
  'gitRevertCommit',
  'createFolder',
  'movePath',
  'deletePath',
  'copyPath',
  'compressPath',
  'extractArchive',
  'mergeFolders',
  'splitFile',
  'setEnvironmentVariable',
  'setPathEntry',
  'writeEnvVar',
  'runDeployScript',
  'deployProject',
  'rollbackDeployment',
  'promoteDeployment',
]);

const TERMINAL_STEP_STATUSES = new Set<PlannedStepStatus>(['rejected', 'completed', 'failed']);

export function getPlanTitle(task: ConversationTaskRecord, action: ConversationTaskAction, plan: ExecutionPlan): string {
  if (action.request.type === 'proposeCodeEditPlan' && action.request.description.trim()) return action.request.description;
  return task.goal || `Plan ${plan.id.slice(0, 8)}`;
}

export function getPlanStepPath(step: PlannedStep): string | undefined {
  const request = step.actionRequest as Record<string, unknown>;
  if (typeof request.path === 'string' && request.path) return request.path;
  if (typeof request.cwd === 'string' && request.cwd) return request.cwd;
  if (typeof request.url === 'string' && request.url) return request.url;
  if (typeof request.to === 'string' && request.to) return request.to;
  return undefined;
}

export function getPlanStepActionLabel(step: PlannedStep): string {
  const type = step.actionRequest.type;
  if (type === 'applyCodeEdit') return 'CHANGE';
  if (type === 'writeFile') return 'WRITE';
  if (type === 'runCommand') return 'COMMAND';
  if (type.startsWith('git')) return 'GIT';
  return type.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
}

export function getPlanStepChangeKind(step: PlannedStep): PlanStepChangeKind {
  const type = step.actionRequest.type;
  if (type === 'applyCodeEdit') return 'change';
  if (type === 'writeFile') return 'write';
  if (type === 'runCommand') return 'command';
  if (type.startsWith('git')) return 'git';
  return 'other';
}

export function countHunkLines(hunks: CodeEditHunk[]): { added: number; deleted: number } {
  return hunks.reduce(
    (totals, hunk) => ({
      added: totals.added + hunk.newLines.length,
      deleted: totals.deleted + hunk.oldLines.length,
    }),
    { added: 0, deleted: 0 }
  );
}

export function planStepRequiresAuthorization(step: PlannedStep): boolean {
  if (AUTHORIZATION_ACTION_TYPES.has(step.actionRequest.type)) return true;
  return 'confirmed' in step.actionRequest;
}

export function getPlanScope(plan: ExecutionPlan): PlanScope {
  const paths = new Set<string>();
  let added = 0;
  let deleted = 0;
  let changeSteps = 0;
  let writeSteps = 0;
  let commandSteps = 0;
  let gitSteps = 0;
  let authorizationSteps = 0;

  plan.steps.forEach((step) => {
    const path = getPlanStepPath(step);
    if (path) paths.add(path);
    if (planStepRequiresAuthorization(step)) authorizationSteps += 1;

    if (step.actionRequest.type === 'applyCodeEdit') {
      changeSteps += 1;
      const counts = countHunkLines(step.actionRequest.edits);
      added += counts.added;
      deleted += counts.deleted;
    } else if (step.actionRequest.type === 'writeFile') {
      writeSteps += 1;
      const content = step.actionRequest.content.replace(/\r?\n$/, '');
      added += content.length > 0 ? content.split(/\r?\n/).length : 0;
    } else if (step.actionRequest.type === 'runCommand') {
      commandSteps += 1;
    } else if (step.actionRequest.type.startsWith('git')) {
      gitSteps += 1;
    }
  });

  return {
    files: paths.size || plan.steps.length,
    added,
    deleted,
    steps: plan.steps.length,
    changeSteps,
    writeSteps,
    commandSteps,
    gitSteps,
    authorizationSteps,
  };
}

export function formatAffectedArea(step: PlannedStep): string {
  if (step.actionRequest.type !== 'applyCodeEdit') return step.actionRequest.type;
  if (step.actionRequest.edits.length === 0) return 'No hunks proposed';
  return step.actionRequest.edits
    .map((hunk, index) => {
      const before = hunk.contextBefore[hunk.contextBefore.length - 1];
      const after = hunk.contextAfter[0];
      if (before && after) return `hunk ${index + 1}: between "${before.trim()}" and "${after.trim()}"`;
      if (before) return `hunk ${index + 1}: after "${before.trim()}"`;
      if (after) return `hunk ${index + 1}: before "${after.trim()}"`;
      return `hunk ${index + 1}`;
    })
    .join('; ');
}

export function buildProposedDiff(step: PlannedStep): string | undefined {
  if (step.actionRequest.type !== 'applyCodeEdit' || step.actionRequest.edits.length === 0) return undefined;
  const lines: string[] = [];
  step.actionRequest.edits.forEach((hunk, index) => {
    if (index > 0) lines.push('');
    lines.push(`@@ proposed hunk ${index + 1} @@`);
    hunk.contextBefore.forEach((line) => lines.push(` ${line}`));
    hunk.oldLines.forEach((line) => lines.push(`-${line}`));
    hunk.newLines.forEach((line) => lines.push(`+${line}`));
    hunk.contextAfter.forEach((line) => lines.push(` ${line}`));
  });
  return lines.join('\n');
}

export function buildPlanDecisionMessage(planId: string, decision: PlanDecision): string {
  if (decision === 'approved') {
    return `I approve plan ${planId}. Continue with the existing authorization gates before applying any code edits, commands, git writes, or other mutations.`;
  }
  return `I reject plan ${planId}. Do not apply the planned mutations. Please revise the plan based on my feedback.`;
}

function getPlanStages(plan: ExecutionPlan): PlanReviewStageModel[] {
  const terminal = plan.steps.every((step) => TERMINAL_STEP_STATUSES.has(step.status));
  const hasExecuting = plan.steps.some((step) => step.status === 'executing');
  const hasCompleted = plan.steps.some((step) => step.status === 'completed');
  const allCompleted = plan.steps.length > 0 && plan.steps.every((step) => step.status === 'completed');
  const hasApproved = plan.steps.some((step) => step.status === 'approved' || step.status === 'executing' || step.status === 'completed');
  const hasRejected = plan.steps.some((step) => step.status === 'rejected');

  return [
    {
      label: 'Understand',
      status: plan.sourceReportId ? 'done' : 'pending',
      description: plan.sourceReportId ? 'Source report linked' : 'No source report id',
    },
    {
      label: 'Plan',
      status: plan.steps.length > 0 ? 'done' : 'pending',
      description: `${plan.steps.length} proposed step${plan.steps.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Approve',
      status: hasApproved || terminal ? 'done' : hasRejected ? 'blocked' : 'active',
      description: hasApproved || terminal ? 'Decision recorded in step state' : 'Awaiting review',
    },
    {
      label: 'Implement',
      status: hasExecuting ? 'active' : hasCompleted ? 'done' : hasRejected ? 'blocked' : 'pending',
      description: hasExecuting ? 'Step executing' : hasCompleted ? 'Mutation step completed' : 'Not started',
    },
    {
      label: 'Verify',
      status: allCompleted ? 'done' : hasRejected ? 'blocked' : 'pending',
      description: allCompleted ? 'All planned steps completed' : 'Runs after implementation',
    },
  ];
}

export function buildPlanReviewModel(task: ConversationTaskRecord, action: ConversationTaskAction, plan: ExecutionPlan): PlanReviewModel {
  const scope = getPlanScope(plan);
  const steps = plan.steps.map((step, index): PlanReviewStepModel => {
    const diff = buildProposedDiff(step);
    const requiresAuthorization = planStepRequiresAuthorization(step);
    return {
      id: step.id,
      index: index + 1,
      status: step.status,
      path: getPlanStepPath(step) ?? step.actionRequest.type,
      actionLabel: getPlanStepActionLabel(step),
      rationale: step.rationale,
      affectedArea: formatAffectedArea(step),
      diff,
      diffState: diff ? 'available' : 'unavailable',
      changeKind: getPlanStepChangeKind(step),
      requiresAuthorization,
      authorizationLabel: requiresAuthorization ? 'Authorization gate applies' : 'Read-only or ungated step',
    };
  });

  return {
    id: plan.id,
    title: getPlanTitle(task, action, plan),
    scope,
    steps,
    stages: getPlanStages(plan),
    permissionSummary: scope.authorizationSteps === 0
      ? 'This plan has no mutation-shaped steps that require the action authorization gate.'
      : `${scope.authorizationSteps} step${scope.authorizationSteps === 1 ? '' : 's'} will still pass through the existing action authorization gate before execution.`,
    terminal: plan.steps.every((step) => TERMINAL_STEP_STATUSES.has(step.status)),
    unplannableCount: plan.unplannableFindingIds.length,
  };
}
