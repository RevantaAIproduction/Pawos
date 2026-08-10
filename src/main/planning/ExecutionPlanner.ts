import { v4 as uuidv4 } from 'uuid';
import type { ActionRequest } from '../../shared/actions/ActionTypes';
import type { ExecutionPlan, PlannedStep } from '../../shared/actions/ExecutionLifecycle';
import type { Finding, IntelligenceReport } from '../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../shared/intelligence/RepositoryReportTypes';

/**
 * One deterministic finding -> ActionRequest mapping rule. Pure: never calls execute(), never
 * imports DesktopExecutionEngine or any mutating plugin — ExecutionPlanner is structurally
 * incapable of running anything it plans, matching the same "intelligence never mutates" wall the
 * five analysis engines already enforce (see the architecture's EvidenceCorrelationReportEngine
 * discipline). `appliesTo` must check both the finding's own evidenceRefs AND re-verify the
 * underlying domain fact directly — never pattern-match on prose alone — so a rule can't
 * accidentally fire on a similarly-worded finding from a different signal.
 */
export interface PlanningRule {
  id: string;
  appliesTo(finding: Finding, report: IntelligenceReport): boolean;
  buildStep(finding: Finding, report: IntelligenceReport): { actionRequest: ActionRequest; rationale: string };
}

function testScaffoldCommand(packageManager: string): string {
  switch (packageManager) {
    case 'yarn':
      return 'yarn add --dev vitest';
    case 'pnpm':
      return 'pnpm add -D vitest';
    default:
      return 'npm install --save-dev vitest';
  }
}

/**
 * Deliberately narrow: most Website/UX/Marketing Intelligence findings describe an externally
 * observed HTML/response fact on a live site whose actual source-code location Paw doesn't
 * necessarily know (the site may not even be a local project), so no safe, deterministic file
 * edit can be synthesized for them today — see the honest `unplannableFindingIds` list buildPlan()
 * produces for exactly this reason. Repository Intelligence findings are different: they're always
 * anchored to a real local `repoPath`, which is what makes automation safe here. This is a real
 * architectural limit, disclosed rather than papered over with a fabricated "fix" for findings
 * that don't have a safe mapping — the rule set is meant to grow only as more such safe mappings
 * are found, never widened by guessing at file locations or content.
 */
export const PLANNING_RULES: PlanningRule[] = [
  {
    id: 'repositoryMissingTests',
    appliesTo(finding, report): boolean {
      if (report.engineId !== 'repository') return false;
      if (!finding.evidenceRefs.includes('context.hasTests')) return false;
      const domain = report.domain as RepositoryReportFields;
      return domain.hasTests === false;
    },
    buildStep(finding, report): { actionRequest: ActionRequest; rationale: string } {
      const domain = report.domain as RepositoryReportFields;
      const command = testScaffoldCommand(domain.packageManager);
      return {
        actionRequest: { type: 'runCommand', command, cwd: domain.repoPath },
        rationale: `Repository Intelligence found no test script or test files in "${domain.workspaceName}" — installing vitest as a starting point for adding real test coverage (finding: "${finding.statement}").`,
      };
    },
  },
];

/**
 * The Think -> Plan boundary: converts a report's user-approved findings into a reviewable
 * ExecutionPlan, one step per finding that a real PlanningRule matches. Never calls
 * desktopExecutionEngine.execute() itself and never imports it — turning the plan into real work
 * is a separate, later step through the normal, unmodified DesktopExecutionEngine.execute() path
 * once a user approves it. Findings that were approved but have no matching rule are named in
 * `unplannableFindingIds` rather than silently dropped or forced into a fabricated step.
 */
export function buildPlan(report: IntelligenceReport, sourceReportId: string, approvedFindingIds: string[]): ExecutionPlan {
  const approvedFindings = report.findings.filter((f) => approvedFindingIds.includes(f.id));
  const steps: PlannedStep[] = [];
  const unplannableFindingIds: string[] = [];

  for (const finding of approvedFindings) {
    const rule = PLANNING_RULES.find((r) => r.appliesTo(finding, report));
    if (!rule) {
      unplannableFindingIds.push(finding.id);
      continue;
    }
    const { actionRequest, rationale } = rule.buildStep(finding, report);
    steps.push({
      id: uuidv4(),
      findingRefs: [finding.id],
      actionRequest,
      rationale,
      status: 'proposed',
    });
  }

  return {
    id: uuidv4(),
    sourceReportId,
    steps,
    unplannableFindingIds,
    approvalRequired: true,
  };
}
