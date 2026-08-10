import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { ConversationTaskRecord } from '../conversation/ConversationTypes';
import type { IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';
import { getIntelligenceReport, getExecutionPlan } from '../conversation/intelligenceReportShape';

/**
 * Action types that mark a task as an Intelligence Runtime task — same shape-based detection
 * discipline as CODING_TASK_ACTION_TYPES/INFRA_TASK_ACTION_TYPES/OFFICE_TASK_ACTION_TYPES in
 * WorkspaceRuntime.tsx. Kept in its own pure (no-JSX, no-CSS-module) file so it's directly
 * unit-testable — WorkspaceRuntime.tsx itself is a .tsx file outside this repo's vitest include
 * glob (`src/**\/*.test.ts`, node environment, no JSX/CSS transform configured).
 */
export const INTELLIGENCE_TASK_ACTION_TYPES = new Set<ActionRequest['type']>([
  'analyzeRepository',
  'investigateRepoBug',
  'analyzeWebsite',
  'crawlWebsite',
  'reviewUx',
  'analyzeMarketing',
  'scoreProduct',
  'askFounderAdvisor',
  'proposeExecutionPlan',
]);

export function isIntelligenceTask(task: ConversationTaskRecord): boolean {
  return task.actions.some((a) => INTELLIGENCE_TASK_ACTION_TYPES.has(a.request.type));
}

/** The most recent real IntelligenceReport a task has produced, if any — for the `intelligenceReport` region. */
export function getLatestIntelligenceReport(task: ConversationTaskRecord): IntelligenceReport | undefined {
  for (const action of [...task.actions].reverse()) {
    const report = getIntelligenceReport(action);
    if (report) return report;
  }
  return undefined;
}

/** The most recent real ExecutionPlan a task has produced, if any — for the `executionPlan` region. */
export function getLatestExecutionPlan(task: ConversationTaskRecord): ExecutionPlan | undefined {
  for (const action of [...task.actions].reverse()) {
    const plan = getExecutionPlan(action);
    if (plan) return plan;
  }
  return undefined;
}
