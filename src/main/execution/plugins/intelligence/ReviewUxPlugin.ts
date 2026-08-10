import type { ActionRequest, ActionResult } from '../../../../shared/actions/ActionTypes';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { UxReportFields } from '../../../../shared/intelligence/UxReportTypes';
import { BasePlugin } from '../../BasePlugin';
import { describeFailure } from '../../describeFailure';
import { correlate, assembleReport } from '../../../intelligence/EvidenceCorrelationReportEngine';
import { gatherUxEvidence } from '../../../intelligence/engines/uxIntelligence/uxEvidence';
import { UX_CORRELATION_RULES, uxReportBuilder } from '../../../intelligence/engines/uxIntelligence/uxCorrelate';
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
 * UX Intelligence — bounded multi-page structural review, reusing the same SiteCrawler/RobotsPolicy
 * infrastructure and always-fresh-confirmation discipline as CrawlWebsitePlugin (reviewing multiple
 * pages of a third-party site is a meaningfully bigger action each time, never silently repeated).
 * Read-only — never proposes or takes any action itself. Deliberately scoped to static HTML
 * structure (headings, alt text, form labeling, landmarks, lang attribute) — see the always-firing
 * `visualLayoutGap` finding for the honest scope limit (no live-browser rendering/screenshot).
 */
export class ReviewUxPlugin extends BasePlugin {
  id = 'reviewUx';

  canHandle(request: ActionRequest): boolean {
    return request.type === 'reviewUx';
  }

  requirements(request: ActionRequest) {
    if (request.type !== 'reviewUx') return [];
    if (!isValidHttpUrl(request.url)) {
      return [{ id: 'url-invalid', message: `"${request.url}" doesn't look like a valid http(s) URL — which website did you mean?` }];
    }
    return [];
  }

  async execute(request: ActionRequest): Promise<ActionResult> {
    if (request.type !== 'reviewUx') return { ok: false, reason: 'failed', message: 'Mismatched request.' };
    if (!isValidHttpUrl(request.url)) return { ok: false, reason: 'failed', message: `"${request.url}" isn't a valid http(s) URL.` };
    if (!request.confirmed) return { ok: false, reason: 'requires-confirmation' };

    const maxPages = Math.min(request.maxPages ?? DEFAULT_MAX_PAGES, MAX_ALLOWED_PAGES);
    const maxDepth = Math.min(request.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);

    const evidence = await gatherUxEvidence({ url: request.url, maxPages, maxDepth, timeoutBudgetMs: CRAWL_TIMEOUT_BUDGET_MS });
    if (evidence.pages.length === 0) {
      return { ok: false, reason: 'failed', message: `Couldn't fetch "${request.url}" — the site may be unreachable, blocking automated requests, or fully disallowed by robots.txt.` };
    }
    const findings = correlate(evidence, UX_CORRELATION_RULES);
    const report = assembleReport('ux', request.url, evidence, findings, uxReportBuilder);

    const pageEntity = recordVisitedPage(request.url);
    recordIntelligenceReport(report, pageEntity.id);

    return { ok: true, data: report };
  }

  describeInProgress(request: ActionRequest): string {
    if (request.type !== 'reviewUx') return 'Working on that…';
    return `Reviewing the UX of ${request.url}…`;
  }

  describeDone(request: ActionRequest, result: ActionResult): string {
    if (request.type !== 'reviewUx') return result.ok ? 'Done.' : describeFailure(result);
    if (!result.ok) {
      if (result.reason === 'requires-confirmation') {
        const maxPages = Math.min(request.maxPages ?? DEFAULT_MAX_PAGES, MAX_ALLOWED_PAGES);
        const maxDepth = Math.min(request.maxDepth ?? DEFAULT_MAX_DEPTH, MAX_ALLOWED_DEPTH);
        return `I'd like to review up to ${maxPages} pages of ${request.url} (up to ${maxDepth} link${maxDepth === 1 ? '' : 's'} deep) for UX/accessibility issues, respecting robots.txt and rate limits. Should I go ahead?`;
      }
      return describeFailure(result);
    }
    const report = result.data as IntelligenceReport<UxReportFields> | undefined;
    if (!report) return 'Done.';
    const count = report.findings.length;
    return `Reviewed ${report.domain.pagesReviewed} page${report.domain.pagesReviewed === 1 ? '' : 's'} of ${report.domain.startUrl} — ${count} finding${count === 1 ? '' : 's'}, UX score ${report.overallScore ?? '—'}.`;
  }
}

export const reviewUxPlugin = new ReviewUxPlugin();
