import type { FindingSeverity, FindingConfidence } from './IntelligenceReportTypes';

/**
 * Founder Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Founder Intelligence gathers
 * no evidence of its own and introduces no separate evidence-gathering engine: it reads the exact
 * same already-persisted Website/UX/Marketing/Repository reports Product Intelligence does (see
 * productEvidence.ts's `gatherAggregatedDomainReports`, reused directly), then reuses Product
 * Intelligence's own correlation rules and adds a small set of composer-only rules (a cross-domain
 * `topPriority` synthesis and role-framed strategic recommendations) on top. `topPriority` is a
 * real finding lifted from one of the underlying reports, never a freeform LLM judgment call —
 * its `severity`/`confidence` are copied forward unchanged from that original finding.
 */
export type FounderReportFields = {
  domainsAnalyzed: string[];
  domainsMissing: string[];
  topPriority?: {
    statement: string;
    severity: FindingSeverity;
    confidence: FindingConfidence;
  };
};
