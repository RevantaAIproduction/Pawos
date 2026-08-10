/**
 * Product Intelligence's domain-specific report fields — the `TDomainFields` the shared
 * IntelligenceReport<T> envelope (IntelligenceReportTypes.ts) wraps. Product Intelligence gathers
 * no evidence of its own: every field here is derived purely from already-persisted Website/UX/
 * Marketing/Repository reports read from the shared Memory Graph (see productEvidence.ts).
 * `domainsMissing` names any requested domain that hasn't been analyzed yet rather than silently
 * omitting it or fabricating a stand-in report.
 */
export type ProductReportFields = {
  websiteSubject?: string;
  uxSubject?: string;
  marketingSubject?: string;
  repositorySubject?: string;
  domainsAnalyzed: string[];
  domainsMissing: string[];
};
