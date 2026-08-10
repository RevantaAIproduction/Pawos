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

const MAX_ALLOWED_PAGES = 50;
const MAX_ALLOWED_DEPTH = 5;
const DEFAULT_MAX_PAGES = 15;
const DEFAULT_MAX_DEPTH = 2;
const CRAWL_TIMEOUT_BUDGET_MS = 60_000;

function isValidHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Website Intelligence — bounded multi-page crawl. This is the "highest-risk phase" surface the
 * architecture calls out: unlike BrowseWebPlugin's single-navigation confirmation (asked once per
 * session, then remembered), every crawlWebsite call requires fresh confirmation — traversing
 * multiple pages of a third-party site unattended is a meaningfully bigger action each time, not
 * something to silently repeat. Requested page/depth bounds are clamped to hard maximums
 * regardless of what's asked for, and every fetch goes through RobotsPolicy (real robots.txt
 * compliance + per-origin rate limiting) via SiteCrawler. Read-only — never proposes or takes any
 * action itself.
 */
export class CrawlWebsitePlugin extends BasePlugin {
  id = 'crawlWebsite';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'crawlWebsite';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'crawlWebsite') return [];
    if (!isValidHttpUrl(request.url)) {
      return [{ id: 'url-invalid', message: `"${request.url}" doesn't look like a valid http(s) URL — which website did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'crawlWebsite') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isValidHttpUrl(request.url)) return { ok: false, reason: 'failed', message: `"${request.url}" isn't a valid http(s) URL.` };
    if (!request.confirmed) return { ok: false, reason: 'requires-confirmation' };

    const maxPages = Math.min(request.maxPages ?? DEFAULT_MAX_PAGES, MAX_ALLOWED_PAGES);
    const maxDepth = Math.min(request.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);

    const evidence = await gatherWebsiteEvidence({ url: request.url, maxPages, maxDepth, timeoutBudgetMs: CRAWL_TIMEOUT_BUDGET_MS });
    if (evidence.pages.length === 0) {
      return { ok: false, reason: 'failed', message: `Couldn't fetch "${request.url}" — the site may be unreachable, blocking automated requests, or fully disallowed by robots.txt.` };
    }
    const findings = correlate(evidence, WEBSITE_CORRELATION_RULES);
    const report = assembleReport('website', request.url, evidence, findings, websiteReportBuilder);

    const pageEntity = recordVisitedPage(request.url, report.domain.pages[0]?.title ?? undefined);
    recordIntelligenceReport(report, pageEntity.id);

    return { ok: true, data: report };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'crawlWebsite') return 'Working on that…';
    return `Crawling ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'crawlWebsite') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        const maxPages = Math.min(request.maxPages ?? DEFAULT_MAX_PAGES, MAX_ALLOWED_PAGES);
        const maxDepth = Math.min(request.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);
        return `I'd like to crawl up to ${maxPages} pages of ${request.url} (up to ${maxDepth} link${maxDepth === 1 ? '' : 's'} deep), respecting robots.txt and rate limits. Should I go ahead?`;
      }
      return describeFailure(result);
    }
    const report = result.data as IntelligenceReport<WebsiteReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Crawled ${report.domain.pagesVisited} page${report.domain.pagesVisited === 1 ? '' : 's'} of ${report.domain.startUrl} — ${count} finding${count === 1 ? '' : 's'}, health score ${report.overallScore ?? '—'}.`;
  }
}

export const crawlWebsitePlugin = new CrawlWebsitePlugin();
