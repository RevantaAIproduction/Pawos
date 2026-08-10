import type { ConversationTaskAction } from './ConversationTypes';
import type { ExecutionPlan } from '../../shared/actions/ExecutionLifecycle';
import type { IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';

/**
 * Pure shape-detection guards for the Intelligence Runtime's two result artifacts — same
 * "shape, not action type" discipline as TaskCard.tsx's getWorkflowMetadata/getBuildStatus/etc.
 * Kept in their own file (rather than inline in TaskCard.tsx like the other guards) purely so they
 * can be unit-tested directly: TaskCard.tsx is a .tsx file outside this repo's vitest include glob
 * (`src/**\/*.test.ts`, node environment, no JSX/CSS-module transform configured), so pure logic
 * that needs real test coverage lives here instead, and TaskCard.tsx just imports it.
 */

/**
 * `IntelligenceReport.approvalRequired` is a literal `false` and `engineId` is a closed
 * six-value union — combined with `findings`/`observedSummary`/`requiresAccessSummary` presence,
 * this is a strong, cheap discriminant against `ExecutionPlan` (whose `approvalRequired` is
 * literal `true`) and against every other existing result shape in this file.
 */
export function getIntelligenceReport(action: ConversationTaskAction): IntelligenceReport | undefined {
  const data = action.result?.data as Partial<IntelligenceReport> | undefined;
  if (!data) return undefined;
  const validEngineIds = ['website', 'repository', 'product', 'ux', 'marketing', 'founder'];
  if (typeof data.engineId !== 'string' || !validEngineIds.includes(data.engineId)) return undefined;
  if (data.approvalRequired !== false) return undefined;
  if (!Array.isArray(data.findings)) return undefined;
  if (typeof data.observedSummary !== 'string') return undefined;
  if (!Array.isArray(data.requiresAccessSummary)) return undefined;
  return data as IntelligenceReport;
}

/**
 * `ExecutionPlan.approvalRequired` is a literal `true` (the opposite discriminant from
 * `IntelligenceReport`) — combined with `steps`/`unplannableFindingIds`/`sourceReportId`
 * presence, this cannot be confused with any other shape in this file.
 */
export function getExecutionPlan(action: ConversationTaskAction): ExecutionPlan | undefined {
  const data = action.result?.data as Partial<ExecutionPlan> | undefined;
  if (!data) return undefined;
  if (data.approvalRequired !== true) return undefined;
  if (typeof data.sourceReportId !== 'string') return undefined;
  if (!Array.isArray(data.steps)) return undefined;
  if (!Array.isArray(data.unplannableFindingIds)) return undefined;
  return data as ExecutionPlan;
}
