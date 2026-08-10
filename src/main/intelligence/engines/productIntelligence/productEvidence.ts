import { findLatestIntelligenceReport } from '../../../memory/entities/intelligenceEntities';
import type { IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { WebsiteReportFields } from '../../../../shared/intelligence/WebsiteReportTypes';
import type { UxReportFields } from '../../../../shared/intelligence/UxReportTypes';
import type { MarketingReportFields } from '../../../../shared/intelligence/MarketingReportTypes';
import type { RepositoryReportFields } from '../../../../shared/intelligence/RepositoryReportTypes';

export type AggregatedDomainReports = {
  requestedUrl?: string;
  requestedRepoPath?: string;
  website?: IntelligenceReport<WebsiteReportFields>;
  ux?: IntelligenceReport<UxReportFields>;
  marketing?: IntelligenceReport<MarketingReportFields>;
  repository?: IntelligenceReport<RepositoryReportFields>;
};

function reportOf<T>(engineId: IntelligenceReport['engineId'], subject: string | undefined): IntelligenceReport<T> | undefined {
  if (!subject) return undefined;
  const entity = findLatestIntelligenceReport(engineId, subject);
  return entity ? (entity.attributes as { report: IntelligenceReport<T> }).report : undefined;
}

/**
 * Reads already-persisted reports from the shared Memory Graph — no HTTP fetch, no git call, no
 * new evidence source of any kind. This is the literal mechanism behind "Product Intelligence
 * aggregates Website/UX/Marketing/Repository findings rather than duplicating their logic" and
 * "Founder Intelligence... without introducing a separate evidence-gathering engine": both
 * ScoreProductPlugin and AskFounderAdvisorPlugin call this exact same function rather than each
 * re-querying the graph their own way.
 */
export function gatherAggregatedDomainReports(input: { url?: string; repoPath?: string }): AggregatedDomainReports {
  return {
    requestedUrl: input.url,
    requestedRepoPath: input.repoPath,
    website: reportOf<WebsiteReportFields>('website', input.url),
    ux: reportOf<UxReportFields>('ux', input.url),
    marketing: reportOf<MarketingReportFields>('marketing', input.url),
    repository: reportOf<RepositoryReportFields>('repository', input.repoPath),
  };
}
