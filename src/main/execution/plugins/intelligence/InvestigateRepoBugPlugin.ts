import * as fs from 'fs';
import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport, type CorrelationRule } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherRepositoryEvidence, type RepositoryEvidence } from '../../../intelligence/engines/repositoryIntelligence/repositoryEvidence';
import { REPOSITORY_CORRELATION_RULES, repositoryReportBuilder } from '../../../intelligence/engines/repositoryIntelligence/repositoryCorrelate';
import { findCodingProjectByRoot } from '../../../memory/entities/codingProjectEntities';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

type RepositoryBugEvidence = RepositoryEvidence & { symptom: string };

/**
 * Honestly-scoped variant of the symptom-agnostic repository rubric: this rule always fires,
 * because static filesystem facts alone can never confirm or rule out a specific described bug —
 * it names that limitation explicitly rather than fabricating a root-cause diagnosis (the discipline
 * every Intelligence engine's rubric follows, same as rootCauseEngine.ts's "never invents a bug it
 * hasn't observed").
 */
const symptomScopeRule: CorrelationRule<RepositoryBugEvidence> = {
  id: 'symptomRequiresDeeperInvestigation',
  evaluate(evidence) {
    return [
      {
        category: 'gap',
        severity: 'info',
        confidence: 'low',
        statement: `Matching the described symptom ("${evidence.symptom}") to a specific root cause requires reading the relevant source files and logs directly — this report only covers the repository's structural facts.`,
        evidenceRefs: ['symptom'],
        provenance: 'requiresInternalDocumentation',
      },
    ];
  },
};

/**
 * "This bug happens when..." / "Users report that..." — the same real evidence-gather ->
 * correlate -> report pipeline as AnalyzeRepositoryPlugin (proving the shared engine composes
 * across more than one entry point/subject framing without duplicating logic), reused with the
 * described symptom carried through as its own field and named as an explicit, honest gap rather
 * than a fabricated diagnosis. Read-only, never gated — any resulting fix goes through the
 * normal, separately-gated writeFile/gitCommit/etc. actions.
 */
export class InvestigateRepoBugPlugin extends BasePlugin {
  id = 'investigateRepoBug';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'investigateRepoBug';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'investigateRepoBug') return [];
    if (!fs.existsSync(request.repoPath)) {
      return [{ id: 'repo-missing', message: `I can't find the folder "${request.repoPath}" — which repository did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'investigateRepoBug') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!fs.existsSync(request.repoPath)) return { ok: false, reason: 'failed', message: `"${request.repoPath}" doesn't exist.` };

    const baseEvidence = await gatherRepositoryEvidence({ repoPath: request.repoPath, remoteFullName: request.remoteFullName });
    const evidence: RepositoryBugEvidence = { ...baseEvidence, symptom: request.symptom };
    const rules: CorrelationRule<RepositoryBugEvidence>[] = [...REPOSITORY_CORRELATION_RULES, symptomScopeRule];
    const findings = correlate(evidence, rules);
    const subject = `${request.symptom} (${request.repoPath})`;
    const report = assembleReport('repository', subject, evidence, findings, repositoryReportBuilder);

    const existingProject = findCodingProjectByRoot(baseEvidence.context.root);
    recordIntelligenceReport(report, existingProject?.id);

    return { ok: true, data: report };
  }

  describeInProgress(): string {
    return 'Investigating the repository for that…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'investigateRepoBug') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as IntelligenceReport<RepositoryReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Checked "${report.domain.workspaceName}" against that — ${count} finding${count === 1 ? '' : 's'} to review.`;
  }
}

export const investigateRepoBugPlugin = new InvestigateRepoBugPlugin();
