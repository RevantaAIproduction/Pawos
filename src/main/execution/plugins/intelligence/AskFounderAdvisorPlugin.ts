import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { FounderReportFields } from '../../../../shared/intelligence/FounderReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherAggregatedDomainReports } from '../../../intelligence/engines/productIntelligence/productEvidence';
import { FOUNDER_CORRELATION_RULES, founderReportBuilder } from '../../../intelligence/engines/founderIntelligence/founderCorrelate';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

/**
 * Founder Intelligence — a composer over Website/UX/Marketing/Repository (and implicitly Product)
 * Intelligence, not a peer engine with its own evidence-gathering. It calls the exact same
 * gatherAggregatedDomainReports() ScoreProductPlugin does — no separate evidence source — and
 * reuses Product Intelligence's own correlation rules, adding only composer-level synthesis
 * (a real cross-report "top priority" and role-framed recommendations). The report is still fully
 * deterministic and provenance-tagged; the "founder persona" is a narration style the model
 * applies when presenting this report in conversation, never a departure from scored, evidenced
 * findings. Read-only and instantaneous — no confirmation needed.
 */
export class AskFounderAdvisorPlugin extends BasePlugin {
  id = 'askFounderAdvisor';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'askFounderAdvisor';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'askFounderAdvisor') return [];
    if (!request.url && !request.repoPath) {
      return [{ id: 'founder-subject-missing', message: 'Which product should I advise on — a website URL, a repository path, or both?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'askFounderAdvisor') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.url && !request.repoPath) {
      return { ok: false, reason: 'failed', message: 'Provide a website URL and/or a repository path to advise on.' };
    }

    const evidence = gatherAggregatedDomainReports({ url: request.url, repoPath: request.repoPath });
    const findings = correlate(evidence, FOUNDER_CORRELATION_RULES);
    const subject = request.url ?? request.repoPath!;
    const report = assembleReport('founder', subject, evidence, findings, founderReportBuilder);

    recordIntelligenceReport(report);

    return { ok: true, data: report };
  }

  describeInProgress(): string {
    return 'Synthesizing strategic recommendations across analyzed domains…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'askFounderAdvisor') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as IntelligenceReport<FounderReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Reviewed ${report.domain.domainsAnalyzed.length} analyzed domain${report.domain.domainsAnalyzed.length === 1 ? '' : 's'} — ${count} recommendation${count === 1 ? '' : 's'}, top priority: ${report.domain.topPriority?.statement ?? 'none identified'}.`;
  }
}

export const askFounderAdvisorPlugin = new AskFounderAdvisorPlugin();
