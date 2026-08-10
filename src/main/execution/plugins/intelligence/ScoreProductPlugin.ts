import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { ProductReportFields } from '../../../../shared/intelligence/ProductReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherAggregatedDomainReports } from '../../../intelligence/engines/productIntelligence/productEvidence';
import { PRODUCT_CORRELATION_RULES, productReportBuilder } from '../../../intelligence/engines/productIntelligence/productCorrelate';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

/**
 * Product Intelligence — a pure aggregator, never a sixth evidence-gathering pipeline. It reads
 * already-persisted Website/UX/Marketing/Repository reports from the shared Memory Graph
 * (gatherAggregatedDomainReports does zero HTTP/git/CDP work of its own) and correlates across
 * them. Read-only and instantaneous (no crawl, no confirmation needed) — matches
 * AnalyzeRepositoryPlugin's no-confirm precedent, since nothing here can be a "bigger action" a
 * user needs to approve.
 */
export class ScoreProductPlugin extends BasePlugin {
  id = 'scoreProduct';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'scoreProduct';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'scoreProduct') return [];
    if (!request.url && !request.repoPath) {
      return [{ id: 'product-subject-missing', message: 'Which product should I score — a website URL, a repository path, or both?' }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'scoreProduct') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!request.url && !request.repoPath) {
      return { ok: false, reason: 'failed', message: 'Provide a website URL and/or a repository path to score.' };
    }

    const evidence = gatherAggregatedDomainReports({ url: request.url, repoPath: request.repoPath });
    const findings = correlate(evidence, PRODUCT_CORRELATION_RULES);
    const subject = request.url ?? request.repoPath!;
    const report = assembleReport('product', subject, evidence, findings, productReportBuilder);

    recordIntelligenceReport(report);

    return { ok: true, data: report };
  }

  describeInProgress(): string {
    return 'Scoring the product across analyzed domains…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'scoreProduct') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as IntelligenceReport<ProductReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Scored the product across ${report.domain.domainsAnalyzed.length} analyzed domain${report.domain.domainsAnalyzed.length === 1 ? '' : 's'} — ${count} finding${count === 1 ? '' : 's'}, product score ${report.overallScore ?? '—'}.`;
  }
}

export const scoreProductPlugin = new ScoreProductPlugin();
