import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherWebsiteEvidence } from '../../../intelligence/engines/websiteIntelligence/websiteEvidence';
import { WEBSITE_CORRELATION_RULES, websiteReportBuilder } from '../../../intelligence/engines/websiteIntelligence/websiteCorrelate';
import { recordVisitedPage } from '../../../memory/entities/webEntities';
import { recordIntelligenceReport } from '../../../memory/entities/intelligenceEntities';

function isValidHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Website Intelligence — single-page analysis. Read-only, a single real HTTP fetch of one URL
 * (no multi-page traversal, no elevated consent needed — the same risk class as reading one web
 * page), gathered/correlated/reported through the same shared EvidenceCorrelationReportEngine
 * Repository Intelligence validated. Never proposes or takes any action itself. Multi-page
 * traversal is CrawlWebsitePlugin's separate, always-confirmed action.
 */
export class AnalyzeWebsitePlugin extends BasePlugin {
  id = 'analyzeWebsite';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'analyzeWebsite';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'analyzeWebsite') return [];
    if (!isValidHttpUrl(request.url)) {
      return [{ id: 'url-invalid', message: `"${request.url}" doesn't look like a valid http(s) URL — which website did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'analyzeWebsite') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isValidHttpUrl(request.url)) return { ok: false, reason: 'failed', message: `"${request.url}" isn't a valid http(s) URL.` };

    const evidence = await gatherWebsiteEvidence({ url: request.url, maxPages: 1, maxDepth: 0 });
    if (evidence.pages.length === 0) {
      return { ok: false, reason: 'failed', message: `Couldn't fetch "${request.url}" — the site may be unreachable or blocking automated requests.` };
    }
    const findings = correlate(evidence, WEBSITE_CORRELATION_RULES);
    const report = assembleReport('website', request.url, evidence, findings, websiteReportBuilder);

    const pageEntity = recordVisitedPage(request.url, report.domain.pages[0]?.title ?? undefined);
    recordIntelligenceReport(report, pageEntity.id);

    return { ok: true, data: report };
  }

  describeInProgress(): string {
    return 'Analyzing the website…';
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'analyzeWebsite') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) return describeFailure(result);
    const report = result.data as IntelligenceReport<WebsiteReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Analyzed ${report.domain.startUrl} — ${count} finding${count === 1 ? '' : 's'}, health score ${report.overallScore ?? '—'}.`;
  }
}

export const analyzeWebsitePlugin = new AnalyzeWebsitePlugin();
