import type { CorrelationRule, ReportBuilder } from '../../EvidenceCorrelationReportEngine';
import type { Finding, FindingSeverity } from '../../../../shared/intelligence/IntelligenceReportTypes';
import type { FounderReportFields } from '../../../../shared/intelligence/FounderReportTypes';
import type { AggregatedDomainReports } from '../productIntelligence/productEvidence';
import { PRODUCT_CORRELATION_RULES, domainLists } from '../productIntelligence/productCorrelate';

const TOP_PRIORITY_PREFIX = 'Top priority across analyzed domains:';
const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 4, major: 3, moderate: 2, minor: 1, info: 0 };

function collectActionableFindings(evidence: AggregatedDomainReports): { domain: string; finding: Finding }[] {
  const candidates: { domain: string; finding: Finding }[] = [];
  if (evidence.website) for (const f of evidence.website.findings) candidates.push({ domain: 'website', finding: f });
  if (evidence.ux) for (const f of evidence.ux.findings) candidates.push({ domain: 'ux', finding: f });
  if (evidence.marketing) for (const f of evidence.marketing.findings) candidates.push({ domain: 'marketing', finding: f });
  if (evidence.repository) for (const f of evidence.repository.findings) candidates.push({ domain: 'repository', finding: f });
  return candidates.filter((c) => c.finding.category === 'risk' || c.finding.category === 'gap');
}

/**
 * Founder Intelligence's rubric — a composer over the other domains, not a sixth peer engine with
 * its own evidence-gathering. Starts from Product Intelligence's exact rule list (same evidence
 * shape, same missing-report/cross-domain logic — reused, never duplicated) and adds three
 * composer-only rules: a real cross-report "top priority" synthesis (lifts one actual finding,
 * carrying its original severity/confidence/provenance forward unchanged — never re-scored) and
 * two role-framed strategic recommendations, each still grounded in real fields/findings from the
 * underlying reports rather than freeform judgment.
 */
export const FOUNDER_CORRELATION_RULES: CorrelationRule<AggregatedDomainReports>[] = [
  ...PRODUCT_CORRELATION_RULES,
  {
    id: 'topPriorityAcrossDomains',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      const actionable = collectActionableFindings(evidence);
      if (actionable.length === 0) return [];
      const top = actionable.sort((a, b) => SEVERITY_RANK[b.finding.severity] - SEVERITY_RANK[a.finding.severity])[0]!;
      return [
        {
          category: top.finding.category,
          severity: top.finding.severity,
          confidence: top.finding.confidence,
          statement: `${TOP_PRIORITY_PREFIX} [${top.domain}] ${top.finding.statement}`,
          evidenceRefs: [`${top.domain}.findings`],
          provenance: top.finding.provenance,
        },
      ];
    },
  },
  {
    id: 'growthAdvisorRecommendation',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.marketing) return [];
      const noCta = evidence.marketing.findings.some((f) => /call-to-action/i.test(f.statement));
      const noAnalytics = evidence.marketing.findings.some((f) => /analytics\/tracking script/i.test(f.statement));
      if (!noCta && !noAnalytics) return [];
      const gaps = [noCta ? 'no clear calls-to-action' : null, noAnalytics ? 'no analytics tracking' : null].filter(Boolean).join(' and ');
      return [
        {
          category: 'opportunity',
          severity: 'moderate',
          confidence: 'medium',
          statement: `As a growth advisor: Marketing Intelligence found ${gaps} — recommend fixing conversion measurement and messaging before increasing acquisition spend.`,
          evidenceRefs: ['marketing.findings'],
          provenance: 'inferred',
        },
      ];
    },
  },
  {
    id: 'technicalArchitectRecommendation',
    evaluate(evidence): Omit<Finding, 'id'>[] {
      if (!evidence.repository || evidence.repository.domain.hasTests) return [];
      return [
        {
          category: 'risk',
          severity: 'moderate',
          confidence: 'medium',
          statement: `As a technical architect: "${evidence.repository.domain.workspaceName}" has no detected test suite — recommend establishing baseline test coverage before further feature work or a production deployment.`,
          evidenceRefs: ['repository.domain.hasTests'],
          provenance: 'observed',
        },
      ];
    },
  },
];

/**
 * Assembles FounderReportFields purely from already-gathered evidence and already-computed
 * findings — reuses Product Intelligence's `domainLists` rather than reimplementing it, and picks
 * `topPriority` back out of `findings` by its rule's fixed statement prefix (the report envelope
 * doesn't carry rule ids on findings, so this is the deterministic, non-fabricated way to recover
 * which finding the topPriorityAcrossDomains rule produced).
 */
export const founderReportBuilder: ReportBuilder<AggregatedDomainReports, FounderReportFields> = {
  build(_subject, evidence, findings): FounderReportFields {
    const { domainsAnalyzed, domainsMissing } = domainLists(evidence);
    const topPriorityFinding = findings.find((f) => f.statement.startsWith(TOP_PRIORITY_PREFIX));
    return {
      domainsAnalyzed,
      domainsMissing,
      topPriority: topPriorityFinding
        ? { statement: topPriorityFinding.statement, severity: topPriorityFinding.severity, confidence: topPriorityFinding.confidence }
        : undefined,
    };
  },
};
