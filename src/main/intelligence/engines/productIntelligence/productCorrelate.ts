import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding, IntelligenceReport } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { ProductReportFields } from '../../../../shared/intelligence/ProductReportTypes';
import type { AggregatedDomainReports } from './productEvidence';

function summarize(label: string, report: IntelligenceReport | undefined, refPrefix: string): Omit<Finding, 'id'>[] {
  if (!report) return [];
  const riskOrGapCount = report.findings.filter((f) => f.category === 'risk' || f.category === 'gap').length;
  const strengthCount = report.findings.filter((f) => f.category === 'strength').length;
  return [
    {
      category: riskOrGapCount > 0 ? 'gap' : 'strength',
      severity: 'info',
      confidence: 'high',
      statement: `${label}: overall score ${report.overallScore ?? '—'} across ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'} (${riskOrGapCount} risk/gap, ${strengthCount} strength).`,
      evidenceRefs: [`${refPrefix}.overallScore`, `${refPrefix}.findings`],
      provenance: 'observed',
    },
  ];
}

/**
 * Product Intelligence's deterministic rubric — reasons only over already-persisted Website/UX/
 * Marketing/Repository reports (gatherAggregatedDomainReports never fetches anything itself), so
 * every rule here is pure aggregation/synthesis, never a re-derivation of a sub-engine's own
 * logic. Two rules are genuinely 'inferred' — conclusions drawn by combining two real reports'
 * actual findings, not themselves directly observed — keeping the Observed/Inferred distinction
 * real rather than a rubber-stamped label. Exported (not just used internally) because Founder
 * Intelligence reuses this exact rule list as its own base rubric rather than re-implementing it.
 */
export const PRODUCT_CORRELATION_RULES: CorrelationRule<AggregatedDomainReports>[] = [
  {
    id: 'missingWebsiteReport',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.requestedUrl || evidence.website) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `No Website Intelligence report found yet for ${evidence.requestedUrl} — run analyze_website or crawl_website first to include it in this view.`,
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
  {
    id: 'missingUxReport',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.requestedUrl || evidence.ux) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `No UX Intelligence report found yet for ${evidence.requestedUrl} — run review_ux first to include it in this view.`,
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
  {
    id: 'missingMarketingReport',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.requestedUrl || evidence.marketing) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `No Marketing Intelligence report found yet for ${evidence.requestedUrl} — run analyze_marketing first to include it in this view.`,
          evidenceRefs: [],
          provenance: 'requiresApiAccess',
        },
      ];
    },
  },
  {
    id: 'missingRepositoryReport',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.requestedRepoPath || evidence.repository) return [];
      return [
        {
          category: 'gap',
          severity: 'info',
          confidence: 'low',
          statement: `No Repository Intelligence report found yet for ${evidence.requestedRepoPath} — run analyze_repository first to include it in this view.`,
          evidenceRefs: [],
          provenance: 'requiresRepositoryAccess',
        },
      ];
    },
  },
  {
    id: 'websiteSummary',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      return summarize('Website Intelligence', evidence.website, 'website');
    },
  },
  {
    id: 'uxSummary',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      return summarize('UX Intelligence', evidence.ux, 'ux');
    },
  },
  {
    id: 'marketingSummary',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      return summarize('Marketing Intelligence', evidence.marketing, 'marketing');
    },
  },
  {
    id: 'repositorySummary',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      return summarize('Repository Intelligence', evidence.repository, 'repository');
    },
  },
  {
    id: 'crossDomainMaturityInferred',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.repository || !evidence.ux) return [];
      const lacksTests = !evidence.repository.domain.hasTests;
      const uxRiskCount = evidence.ux.findings.filter((f) => f.category === 'risk').length;
      if (!lacksTests || uxRiskCount < 2) return [];
      return [
        {
          category: 'opportunity',
          severity: 'moderate',
          confidence: 'medium',
          statement: `Repository Intelligence found no test suite in "${evidence.repository.domain.workspaceName}", and UX Intelligence found ${uxRiskCount} accessibility/UX risks on ${evidence.ux.subject} — together this reads as an early-stage product where foundational engineering and UX work may deserve priority over new feature or marketing investment.`,
          evidenceRefs: ['repository.domain.hasTests', 'ux.findings'],
          provenance: 'inferred',
        },
      ];
    },
  },
  {
    id: 'crossDomainDiscoverabilityInferred',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.website || !evidence.marketing) return [];
      const websiteSeoGap = evidence.website.findings.some((f) => /meta description|<title>/i.test(f.statement));
      const marketingShareGap = evidence.marketing.findings.some((f) => /Open Graph|Twitter Card/i.test(f.statement));
      if (!websiteSeoGap || !marketingShareGap) return [];
      return [
        {
          category: 'opportunity',
          severity: 'moderate',
          confidence: 'medium',
          statement:
            'Website Intelligence flagged SEO gaps (missing title/meta description) and Marketing Intelligence separately flagged missing social-sharing tags on the same site — together this suggests a broader content/metadata investment gap rather than two isolated issues.',
          evidenceRefs: ['website.findings', 'marketing.findings'],
          provenance: 'inferred',
        },
      ];
    },
  },
];

function domainLists(evidence: AggregatedDomainReports): { domainsAnalyzed: string[]; domainsMissing: string[] } {
  const domainsAnalyzed: string[] = [];
  const domainsMissing: string[] = [];
  if (evidence.requestedUrl) {
    (evidence.website ? domainsAnalyzed : domainsMissing).push('website');
    (evidence.ux ? domainsAnalyzed : domainsMissing).push('ux');
    (evidence.marketing ? domainsAnalyzed : domainsMissing).push('marketing');
  }
  if (evidence.requestedRepoPath) {
    (evidence.repository ? domainsAnalyzed : domainsMissing).push('repository');
  }
  return { domainsAnalyzed, domainsMissing };
}

/**
 * Assembles ProductReportFields purely from already-gathered (i.e. already-persisted elsewhere)
 * evidence — same discipline as every other engine's ReportBuilder. Exported alongside
 * `domainLists` so founderCorrelate.ts's ReportBuilder can reuse the exact same domain-list logic
 * rather than reimplementing it.
 */
export const productReportBuilder: ReportBuilder<AggregatedDomainReports, ProductReportFields> = {
  build(_subject, evidence, _findings): ProductReportFields {
    const { domainsAnalyzed, domainsMissing } = domainLists(evidence);
    return {
      websiteSubject: evidence.website?.subject,
      uxSubject: evidence.ux?.subject,
      marketingSubject: evidence.marketing?.subject,
      repositorySubject: evidence.repository?.subject,
      domainsAnalyzed,
      domainsMissing,
    };
  },
};

export { domainLists };
